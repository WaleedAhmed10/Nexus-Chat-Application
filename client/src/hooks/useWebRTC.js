import { useEffect, useRef, useState, useCallback } from "react";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // Add TURN server here for production:
    // { urls: "turn:your-turn-server.com", username: "user", credential: "pass" }
  ],
};

const RING_TIMEOUT_MS = 30000;
const DISCONNECT_GRACE_MS = 8000;

/**
 * 1:1 audio/video calls signalled over Socket.io.
 *
 * Flow:
 *   caller: getUserMedia + create peer -> call:start -> (rings)
 *   callee: accept -> getUserMedia + create peer -> call:accept
 *   caller: on call:accepted -> createOffer -> webrtc:offer
 *   callee: setRemote(offer) -> answer -> webrtc:answer
 *   both:   exchange ICE (queued until the remote description is set)
 */
export default function useWebRTC({ socket, roomId, currentUser }) {
  const [callState, setCallStateRaw] = useState("idle"); // idle | calling | incoming | connected
  const [callType, setCallType] = useState("video"); // video | audio
  const [incomingCall, setIncomingCallRaw] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Mutable call data lives in refs so socket handlers never see stale values.
  const stateRef = useRef("idle");
  const incomingRef = useRef(null);
  const socketRef = useRef(socket);
  const myIdRef = useRef(currentUser?._id);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const callRoomRef = useRef(null); // room the call was started/received in
  const peerIdRef = useRef(null); // the other participant's user id
  const roleRef = useRef(null); // "caller" | "callee"
  const pendingIceRef = useRef([]);
  const ringTimerRef = useRef(null);
  const busyRef = useRef(false); // guards double-click on start/accept
  const api = useRef({}); // always-fresh implementations, used by listeners

  socketRef.current = socket;
  myIdRef.current = currentUser?._id;

  const setCallState = (s) => {
    stateRef.current = s;
    setCallStateRaw(s);
  };
  const setIncomingCall = (c) => {
    incomingRef.current = c;
    setIncomingCallRaw(c);
  };

  const emit = (event, payload = {}, room = callRoomRef.current) => {
    if (socketRef.current && room) socketRef.current.emit(event, { roomId: room, ...payload });
  };

  const clearRingTimer = () => {
    clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
  };

  const attachStreams = () => {
    if (localVideoRef.current && localStreamRef.current && localVideoRef.current.srcObject !== localStreamRef.current)
      localVideoRef.current.srcObject = localStreamRef.current;
    if (remoteVideoRef.current && remoteStreamRef.current && remoteVideoRef.current.srcObject !== remoteStreamRef.current)
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
  };

  // <video> elements are mounted/unmounted as the call screen changes, so
  // streams must be re-attached after every state change.
  useEffect(() => {
    attachStreams();
  });

  const cleanup = () => {
    clearRingTimer();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.ontrack = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
    }
    peerRef.current = null;
    pendingIceRef.current = [];
    peerIdRef.current = null;
    roleRef.current = null;
    busyRef.current = false;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  const resetToIdle = () => {
    cleanup();
    callRoomRef.current = null;
    setIncomingCall(null);
    setIsMuted(false);
    setIsCamOff(false);
    setCallState("idle");
  };

  const getMedia = async (type) =>
    navigator.mediaDevices.getUserMedia({ video: type === "video", audio: true });

  const createPeer = (stream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.ontrack = (e) => {
      remoteStreamRef.current = e.streams[0];
      attachStreams();
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) emit("webrtc:ice", { candidate: e.candidate, to: peerIdRef.current });
    };

    pc.onconnectionstatechange = () => {
      if (pc !== peerRef.current) return;
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        api.current.endCall();
      } else if (pc.connectionState === "disconnected") {
        // "disconnected" is often transient – only hang up if it doesn't recover.
        setTimeout(() => {
          if (pc === peerRef.current && pc.connectionState === "disconnected") api.current.endCall();
        }, DISCONNECT_GRACE_MS);
      }
    };

    peerRef.current = pc;
    return pc;
  };

  const flushPendingIce = async () => {
    const pc = peerRef.current;
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const c of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* stale candidate */ }
    }
  };

  // ── Actions ──────────────────────────────────────────────────────

  const startCall = async (type = "video") => {
    if (!socketRef.current || !roomId || stateRef.current !== "idle" || busyRef.current) return;
    busyRef.current = true;
    callRoomRef.current = roomId;
    roleRef.current = "caller";
    setCallType(type);
    setCallState("calling");

    try {
      const stream = await getMedia(type);
      if (stateRef.current !== "calling") {
        // cancelled while the permission prompt was open
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      createPeer(stream);
      attachStreams();
      emit("call:start", { callType: type });

      ringTimerRef.current = setTimeout(() => {
        if (stateRef.current === "calling") {
          emit("call:cancel");
          resetToIdle();
          alert("No answer.");
        }
      }, RING_TIMEOUT_MS);
    } catch (err) {
      console.error("Could not start call:", err);
      resetToIdle();
      alert("Could not access your microphone/camera. Check browser permissions.");
    }
  };

  const acceptCall = async () => {
    const call = incomingRef.current;
    if (!call || !socketRef.current || busyRef.current) return;
    busyRef.current = true;
    clearRingTimer();
    callRoomRef.current = call.roomId;
    peerIdRef.current = call.callerId;
    roleRef.current = "callee";
    setCallType(call.callType);

    try {
      const stream = await getMedia(call.callType);
      if (incomingRef.current !== call) {
        // caller cancelled / someone else answered while permission prompt was open
        stream.getTracks().forEach((t) => t.stop());
        busyRef.current = false;
        return;
      }
      localStreamRef.current = stream;
      createPeer(stream);
      setIncomingCall(null);
      setCallState("connected");
      attachStreams();
      // Tell the caller only once our peer exists, so the offer can't arrive too early.
      emit("call:accept", { to: call.callerId });
    } catch (err) {
      console.error("Could not accept call:", err);
      emit("call:reject", { to: call.callerId });
      resetToIdle();
      alert("Could not access your microphone/camera. Check browser permissions.");
    }
  };

  const rejectCall = () => {
    const call = incomingRef.current;
    if (call) emit("call:reject", { to: call.callerId }, call.roomId);
    resetToIdle();
  };

  const endCall = () => {
    const st = stateRef.current;
    if (st === "calling") emit("call:cancel");
    else if (st === "connected") emit("call:end");
    resetToIdle();
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getAudioTracks();
    const nextEnabled = !(tracks[0]?.enabled ?? true);
    tracks.forEach((t) => (t.enabled = nextEnabled));
    setIsMuted(!nextEnabled);
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    const nextEnabled = !(tracks[0]?.enabled ?? true);
    tracks.forEach((t) => (t.enabled = nextEnabled));
    setIsCamOff(!nextEnabled);
  };

  // ── Socket listeners ─────────────────────────────────────────────

  api.current = { endCall, cleanup, resetToIdle, flushPendingIce };

  useEffect(() => {
    if (!socket) return;
    const forMe = (to) => !to || to === myIdRef.current;

    const onIncoming = (data) => {
      if (stateRef.current !== "idle") return; // already busy
      setIncomingCall(data);
      setCallType(data.callType);
      setCallState("incoming");
      clearRingTimer();
      ringTimerRef.current = setTimeout(() => {
        if (stateRef.current === "incoming" && !busyRef.current) api.current.resetToIdle();
      }, RING_TIMEOUT_MS);
    };

    const onAccepted = async ({ calleeId, to }) => {
      if (!forMe(to)) return;
      // Somebody else in the room picked up while we were still ringing.
      if (stateRef.current === "incoming") {
        if (!busyRef.current) api.current.resetToIdle();
        return;
      }
      if (roleRef.current !== "caller" || stateRef.current !== "calling" || peerIdRef.current) return;
      const pc = peerRef.current;
      if (!pc) return;
      peerIdRef.current = calleeId; // first one to answer wins
      clearRingTimer();
      setCallState("connected");
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        emit("webrtc:offer", { offer, to: calleeId });
      } catch (err) {
        console.error("Offer failed:", err);
        api.current.endCall();
      }
    };

    const onRejected = ({ to }) => {
      if (!forMe(to)) return;
      if (roleRef.current === "caller" && stateRef.current === "calling") {
        api.current.resetToIdle();
        alert("Call was declined.");
      }
    };

    const onCancelled = ({ callerId }) => {
      if (stateRef.current === "incoming" && incomingRef.current?.callerId === callerId && !busyRef.current)
        api.current.resetToIdle();
    };

    const onEnded = ({ by }) => {
      const st = stateRef.current;
      if (st === "connected" && by === peerIdRef.current) api.current.resetToIdle();
      else if (st === "incoming" && incomingRef.current?.callerId === by && !busyRef.current)
        api.current.resetToIdle();
    };

    const onOffer = async ({ offer, from, to }) => {
      const pc = peerRef.current;
      if (!forMe(to) || !pc || roleRef.current !== "callee" || from !== peerIdRef.current) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await api.current.flushPendingIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        emit("webrtc:answer", { answer, to: from });
      } catch (err) {
        console.error("Answer failed:", err);
        api.current.endCall();
      }
    };

    const onAnswer = async ({ answer, from, to }) => {
      const pc = peerRef.current;
      if (!forMe(to) || !pc || roleRef.current !== "caller" || from !== peerIdRef.current) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await api.current.flushPendingIce();
      } catch (err) {
        console.error("Setting answer failed:", err);
        api.current.endCall();
      }
    };

    const onIce = async ({ candidate, from, to }) => {
      if (!forMe(to) || !candidate || from !== peerIdRef.current) return;
      const pc = peerRef.current;
      // Candidates can beat the SDP – hold them until a remote description exists.
      if (!pc || !pc.remoteDescription) {
        pendingIceRef.current.push(candidate);
        return;
      }
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* stale candidate */ }
    };

    socket.on("call:incoming", onIncoming);
    socket.on("call:accepted", onAccepted);
    socket.on("call:rejected", onRejected);
    socket.on("call:cancelled", onCancelled);
    socket.on("call:ended", onEnded);
    socket.on("webrtc:offer", onOffer);
    socket.on("webrtc:answer", onAnswer);
    socket.on("webrtc:ice", onIce);

    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:accepted", onAccepted);
      socket.off("call:rejected", onRejected);
      socket.off("call:cancelled", onCancelled);
      socket.off("call:ended", onEnded);
      socket.off("webrtc:offer", onOffer);
      socket.off("webrtc:answer", onAnswer);
      socket.off("webrtc:ice", onIce);
    };
  }, [socket]);

  // Hang up and release camera/mic if the page unmounts (e.g. logout) mid-call.
  useEffect(
    () => () => {
      const st = stateRef.current;
      if (st === "calling") emit("call:cancel");
      else if (st === "connected") emit("call:end");
      cleanup();
    },
    []
  );

  // Keep the old API shape (stable callbacks) for consumers.
  const startCallCb = useCallback((t) => api.current.startCall(t), []);
  const acceptCallCb = useCallback(() => api.current.acceptCall(), []);
  const rejectCallCb = useCallback(() => api.current.rejectCall(), []);
  const endCallCb = useCallback(() => api.current.endCall(), []);
  const toggleMuteCb = useCallback(() => api.current.toggleMute(), []);
  const toggleCameraCb = useCallback(() => api.current.toggleCamera(), []);
  api.current = { ...api.current, startCall, acceptCall, rejectCall, toggleMute, toggleCamera };

  return {
    callState, callType, incomingCall,
    isMuted, isCamOff,
    localVideoRef, remoteVideoRef,
    startCall: startCallCb, acceptCall: acceptCallCb, rejectCall: rejectCallCb, endCall: endCallCb,
    toggleMute: toggleMuteCb, toggleCamera: toggleCameraCb,
  };
}

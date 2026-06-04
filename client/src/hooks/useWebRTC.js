import { useEffect, useRef, useState, useCallback } from "react";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // Add TURN server here for production:
    // { urls: "turn:your-turn-server.com", username: "user", credential: "pass" }
  ],
};

export default function useWebRTC({ socket, roomId, currentUser }) {
  const [callState, setCallState] = useState("idle"); // idle | calling | incoming | connected
  const [callType, setCallType] = useState("video");  // video | audio
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);

  // ── Helpers ─────────────────────────────────────────────────────

  const getMedia = useCallback(async (type) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: type === "video",
      audio: true,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }, []);

  const createPeer = useCallback((stream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && socket && roomId) {
        socket.emit("webrtc:ice", { roomId, candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        endCall();
      }
    };

    peerRef.current = pc;
    return pc;
  }, [socket, roomId]);

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  // ── Actions ──────────────────────────────────────────────────────

  const startCall = useCallback(async (type = "video") => {
    if (!socket || !roomId) return;
    setCallType(type);
    setCallState("calling");
    socket.emit("call:start", { roomId, callType: type });

    const stream = await getMedia(type);
    const pc = createPeer(stream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("webrtc:offer", { roomId, offer });
  }, [socket, roomId, getMedia, createPeer]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall || !socket) return;
    setCallState("connected");
    socket.emit("call:accept", { roomId });

    const stream = await getMedia(incomingCall.callType);
    createPeer(stream);
    setIncomingCall(null);
  }, [incomingCall, socket, roomId, getMedia, createPeer]);

  const rejectCall = useCallback(() => {
    if (!socket) return;
    socket.emit("call:reject", { roomId });
    setIncomingCall(null);
    setCallState("idle");
  }, [socket, roomId]);

  const endCall = useCallback(() => {
    if (socket && roomId) socket.emit("call:end", { roomId });
    cleanup();
    setCallState("idle");
    setIncomingCall(null);
    setIsMuted(false);
    setIsCamOff(false);
  }, [socket, roomId, cleanup]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setIsMuted((m) => !m);
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setIsCamOff((c) => !c);
  }, []);

  // ── Socket listeners ─────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const onIncoming = (data) => {
      setIncomingCall(data);
      setCallState("incoming");
    };

    const onAccepted = () => {
      setCallState("connected");
    };

    const onRejected = () => {
      cleanup();
      setCallState("idle");
      alert("Call was declined.");
    };

    const onCancelled = () => {
      cleanup();
      setCallState("idle");
      setIncomingCall(null);
    };

    const onEnded = () => {
      cleanup();
      setCallState("idle");
      setIncomingCall(null);
    };

    const onOffer = async ({ offer }) => {
      if (!peerRef.current) return;
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerRef.current.createAnswer();
      await peerRef.current.setLocalDescription(answer);
      socket.emit("webrtc:answer", { roomId, answer });
    };

    const onAnswer = async ({ answer }) => {
      if (!peerRef.current) return;
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    };

    const onIce = async ({ candidate }) => {
      if (!peerRef.current || !candidate) return;
      try { await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
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
  }, [socket, roomId, cleanup]);

  return {
    callState, callType, incomingCall,
    isMuted, isCamOff,
    localVideoRef, remoteVideoRef,
    startCall, acceptCall, rejectCall, endCall,
    toggleMute, toggleCamera,
  };
}

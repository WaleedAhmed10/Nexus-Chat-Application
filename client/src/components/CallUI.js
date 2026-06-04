import "./CallUI.css";

export default function CallUI({
  callState, callType, incomingCall,
  isMuted, isCamOff,
  localVideoRef, remoteVideoRef,
  onAccept, onReject, onEnd,
  onToggleMute, onToggleCamera,
  roomName,
}) {
  if (callState === "idle") return null;

  return (
    <div className="call-overlay">
      {/* Incoming Call Screen */}
      {callState === "incoming" && incomingCall && (
        <div className="call-card incoming">
          <div className="call-pulse" />
          <div className="call-avatar-ring">
            <img
              src={`https://api.dicebear.com/7.x/initials/svg?seed=${incomingCall.callerName}&backgroundColor=7c3aed&textColor=ffffff`}
              alt=""
            />
          </div>
          <div className="call-info">
            <span className="call-label">{incomingCall.callType === "video" ? "📹" : "🎙️"} Incoming {incomingCall.callType} call</span>
            <h2>{incomingCall.callerName}</h2>
            <span className="call-room">in #{roomName}</span>
          </div>
          <div className="call-actions incoming-actions">
            <button className="call-btn reject" onClick={onReject}>✕</button>
            <button className="call-btn accept" onClick={onAccept}>✓</button>
          </div>
        </div>
      )}

      {/* Calling (waiting) Screen */}
      {callState === "calling" && (
        <div className="call-card calling">
          <div className="call-spinner" />
          <div className="call-info">
            <span className="call-label">{callType === "video" ? "📹" : "🎙️"} Calling room...</span>
            <h2>#{roomName}</h2>
            <span className="call-room">Waiting for someone to answer</span>
          </div>
          <div className="call-actions">
            <button className="call-btn end" onClick={onEnd}>✕ Cancel</button>
          </div>
          {/* Show local preview while calling */}
          {callType === "video" && (
            <video ref={localVideoRef} autoPlay muted playsInline className="local-preview calling-preview" />
          )}
        </div>
      )}

      {/* Active Call Screen */}
      {callState === "connected" && (
        <div className="call-active">
          {/* Remote video (full screen) */}
          <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />

          {/* Local video (picture-in-picture) */}
          {callType === "video" && (
            <video ref={localVideoRef} autoPlay muted playsInline className="local-preview pip" />
          )}

          {/* Controls bar */}
          <div className="call-controls">
            <div className="call-controls-inner">
              <button
                className={`ctrl-btn ${isMuted ? "active" : ""}`}
                onClick={onToggleMute}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? "🔇" : "🎙️"}
              </button>

              {callType === "video" && (
                <button
                  className={`ctrl-btn ${isCamOff ? "active" : ""}`}
                  onClick={onToggleCamera}
                  title={isCamOff ? "Turn camera on" : "Turn camera off"}
                >
                  {isCamOff ? "📵" : "📹"}
                </button>
              )}

              <button className="ctrl-btn end-call" onClick={onEnd} title="End call">
                📵
              </button>
            </div>
          </div>

          {/* Call info badge */}
          <div className="call-badge">
            <span className="live-dot" />
            Live · #{roomName}
          </div>
        </div>
      )}
    </div>
  );
}

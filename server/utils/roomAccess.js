const Room = require("../models/Room");

// Strict 24-hex check. (mongoose.isValidObjectId also accepts any 12-char string.)
const isObjectId = (v) => typeof v === "string" && /^[a-f\d]{24}$/i.test(v);

// A user can access a room if it is public, or they are a member of it.
const canAccessRoom = async (roomId, userId) => {
  if (!isObjectId(roomId)) return false;
  const found = await Room.exists({
    _id: roomId,
    $or: [{ isPrivate: false }, { members: userId }],
  });
  return !!found;
};

module.exports = { isObjectId, canAccessRoom };

const router = require("express").Router();
const Message = require("../models/Message");
const { verifyToken } = require("../middleware/auth");
const { canAccessRoom } = require("../utils/roomAccess");

router.use(verifyToken);

// Get the latest messages for a room (oldest -> newest)
router.get("/:roomId", async (req, res) => {
  try {
    if (!(await canAccessRoom(req.params.roomId, req.user._id)))
      return res.status(403).json({ message: "No access to this room" });

    // Sort newest-first so limit() keeps the LATEST 100, then flip for display.
    const messages = await Message.find({ room: req.params.roomId })
      .populate("sender", "username avatar")
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(messages.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

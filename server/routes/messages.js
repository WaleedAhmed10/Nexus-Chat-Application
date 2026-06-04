const router = require("express").Router();
const Message = require("../models/Message");
const { verifyToken } = require("../middleware/auth");

router.use(verifyToken);

// Get messages for a room
router.get("/:roomId", async (req, res) => {
  try {
    const messages = await Message.find({ room: req.params.roomId })
      .populate("sender", "username avatar")
      .sort({ createdAt: 1 })
      .limit(100);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

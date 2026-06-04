const router = require("express").Router();
const Room = require("../models/Room");
const { verifyToken } = require("../middleware/auth");

router.use(verifyToken);

// Get all public rooms + rooms user is in
router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find({
      $or: [{ isPrivate: false }, { members: req.user._id }],
    }).populate("createdBy", "username");
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create room
router.post("/", async (req, res) => {
  try {
    const { name, description, isPrivate } = req.body;
    const room = await Room.create({
      name, description, isPrivate,
      createdBy: req.user._id,
      members: [req.user._id],
    });
    await room.populate("createdBy", "username");
    res.status(201).json(room);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Join room
router.post("/:id/join", async (req, res) => {
  try {
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { members: req.user._id } },
      { new: true }
    ).populate("createdBy", "username");
    res.json(room);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

const router = require("express").Router();
const Room = require("../models/Room");
const { verifyToken } = require("../middleware/auth");
const { isObjectId, canAccessRoom } = require("../utils/roomAccess");

router.use(verifyToken);

// Get all public rooms + rooms user is in
router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find({
      $or: [{ isPrivate: false }, { members: req.user._id }],
    }).populate("createdBy", "username");
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Create room
router.post("/", async (req, res) => {
  try {
    const { name, description, isPrivate } = req.body || {};
    if (typeof name !== "string" || !name.trim())
      return res.status(400).json({ message: "Room name is required" });
    if (name.trim().length > 50)
      return res.status(400).json({ message: "Room name must be 50 characters or fewer" });

    const room = await Room.create({
      name: name.trim(),
      description: typeof description === "string" ? description.slice(0, 200) : "",
      isPrivate: isPrivate === true,
      createdBy: req.user._id,
      members: [req.user._id],
    });
    await room.populate("createdBy", "username");
    res.status(201).json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Join room (private rooms can only be "joined" by existing members)
router.post("/:id/join", async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid room id" });
    if (!(await canAccessRoom(req.params.id, req.user._id)))
      return res.status(403).json({ message: "No access to this room" });

    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { members: req.user._id } },
      { new: true }
    ).populate("createdBy", "username");
    if (!room) return res.status(404).json({ message: "Room not found" });
    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

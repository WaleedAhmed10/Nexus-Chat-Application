const router = require("express").Router();
const User = require("../models/User");
const { generateToken, verifyToken } = require("../middleware/auth");

const isStr = (v) => typeof v === "string";

// Register
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    // typeof checks also block NoSQL-operator payloads like { "$ne": null }
    if (!isStr(username) || !isStr(email) || !isStr(password) || !username.trim() || !email.trim() || !password)
      return res.status(400).json({ message: "All fields required" });
    if (username.trim().length < 3)
      return res.status(400).json({ message: "Username must be at least 3 characters" });
    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters" });

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    const exists = await User.findOne({ $or: [{ email: cleanEmail }, { username: cleanUsername }] });
    if (exists) return res.status(409).json({ message: "Username or email already taken" });

    const user = await User.create({ username: cleanUsername, email: cleanEmail, password });
    const token = generateToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Username or email already taken" });
    if (err.name === "ValidationError") return res.status(400).json({ message: Object.values(err.errors)[0].message });
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!isStr(email) || !isStr(password) || !email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: "Invalid credentials" });

    const token = generateToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Me
router.get("/me", verifyToken, (req, res) => res.json(req.user));

module.exports = router;

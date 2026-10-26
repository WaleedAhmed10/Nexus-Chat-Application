const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Never silently fall back to a publicly-known secret in production.
if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET must be set in production");
}
const JWT_SECRET = process.env.JWT_SECRET || "dev_only_insecure_secret";
if (!process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET is not set – using an insecure development secret.");
}

const verifyToken = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) return res.status(401).json({ message: "No token provided" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

const verifySocketToken = async (socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error("No token"));

    const decoded = jwt.verify(token, JWT_SECRET);
    // Reject tokens that belong to a deleted account.
    const user = await User.findById(decoded.id).select("username");
    if (!user) return next(new Error("User not found"));

    socket.user = { id: String(user._id), username: user.username };
    next();
  } catch {
    next(new Error("Invalid token"));
  }
};

const generateToken = (user) => {
  return jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
};

module.exports = { verifyToken, verifySocketToken, generateToken };

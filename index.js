import express from "express"
import rateLimit from "express-rate-limit";
import cors from "cors"
import "dotenv/config.js";
import images from "./images.js"
import users from "./users.js"
import multer from "multer";

const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
	standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
	ipv6Subnet: 56, // Set to 60 or 64 to be less aggressive, or 52 or 48 to be more aggressive
})

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "127.0.0.1";

app.use(limiter)
app.use(express.json());
app.use(cors())

app.use("/api/images", images)
app.use("/api/users", users)

app.get("/api", (req, res) => {
  res.send({
    mess: "API works!"
  })
})

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
	return res.status(400).json({ mess: err.message });
  }
  next(err);
});

if (!process.env.VERCEL) {
  const server = app.listen(PORT, HOST, () => {
    const address = server.address();
    const resolvedPort = typeof address === "object" && address && "port" in address
      ? address.port
      : PORT;
    console.log(`server is running on http://${HOST}:${resolvedPort}`);
  });

  server.on("error", (error) => {
    console.error("failed to start server", error);
  });
}

export default app;

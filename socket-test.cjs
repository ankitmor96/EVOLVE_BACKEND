
const { io } = require("socket.io-client");

const socket = io("http://localhost:3000", {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
});

socket.on("connect", () => {
    console.log("✅ Connected:", socket.id);
});

// Backend thi maximum 10 posts na batch receive thashe.
socket.on("posts-batch", (posts) => {
    console.log(`\n📦 Batch received: ${posts.length} post(s)`);

    posts.forEach((data) => {
        console.log(
            `📢 Post ID: ${data.post?.id}, Caption: ${data.post?.caption}`
        );
    });
});

socket.on("connect_error", (error) => {
    console.error("❌ Connection error:", error.message);
});

socket.on("disconnect", (reason) => {
    console.log("🔌 Disconnected:", reason);
});

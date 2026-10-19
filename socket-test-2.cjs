
const { io } = require("socket.io-client");

const socket = io("http://localhost:3000", {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
});

socket.on("connect", () => {
    console.log("✅ Client 2 connected:", socket.id);
});

socket.on("post-updates-batch", (updates) => {
    console.log("\n📦 Client 2 received updates:");

    console.log(JSON.stringify(updates, null, 2));
});

socket.on("posts-batch", (posts) => {
    console.log(`📢 Client 2 received ${posts.length} post(s)`);
});

socket.on("connect_error", (error) => {
    console.error("❌ Connection error:", error.message);
});

socket.on("disconnect", (reason) => {
    console.log("🔌 Client 2 disconnected:", reason);
});


const { io } = require("socket.io-client");

// const socket = io("https://evolve-backend-4lux.onrender.com", {
const socket = io("http://localhost:3000", {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
});

socket.on("connect", () => {
    console.log("✅ Connected:", socket.id);
});

// ===============================
// 1. POSTS BATCH
// ===============================
socket.on("posts-batch", (posts) => {
    console.log(`\n📦 Batch received: ${posts.length} post(s)`);

    posts.forEach((data) => {
        console.log(
            `📢 Post ID: ${data.post?.id}, Caption: ${data.post?.caption}`
        );
    });
});

// ===============================
// 2. POST REACTION / LEARNING UPDATES
// ===============================
socket.on("post-updates-batch", (updates) => {
    console.log(
        `\n📦 Post updates received: ${updates.length} update(s)`
    );

    updates.forEach((update) => {
        console.log("🔔 Update:", JSON.stringify(update, null, 2));
    });
});

// ===============================
// 3. CONNECTION REQUEST RECEIVED
// ===============================
socket.on("connection.requested", (data) => {
    console.log("\n👤 New connection request received!");
    console.log("🔔 Connection ID:", data.connectionId);
    console.log("👤 Requester ID:", data.requesterId);
    console.log("👤 Receiver ID:", data.receiverId);
    console.log("📌 Status:", data.status);
    console.log("📦 Full data:", JSON.stringify(data, null, 2));
}); 

// ===============================x
// 4. CONNECTION REQUEST ACCEPTED
// ===============================
socket.on("connection.accepted", (data) => {
    console.log("\n✅ Connection request accepted!");
    console.log("🔔 Connection ID:", data.connectionId);
    console.log("👤 Requester ID:", data.requesterId);
    console.log("👤 Receiver ID:", data.receiverId);
    console.log("📌 Status:", data.status);
    console.log("📦 Full data:", JSON.stringify(data, null, 2));
});

// ===============================
// 5. CONNECTION REQUEST REJECTED
// ===============================
socket.on("connection.rejected", (data) => {
    console.log("\n❌ Connection request rejected!");
    console.log("🔔 Connection ID:", data.connectionId);
    console.log("👤 Requester ID:", data.requesterId);
    console.log("👤 Receiver ID:", data.receiverId);
    console.log("📌 Status:", data.status);
    console.log("📦 Full data:", JSON.stringify(data, null, 2));
});

// ===============================
// 6. CONNECTION REMOVED / REQUEST CANCELLED
// ===============================
socket.on("connection.removed", (data) => {
    console.log("\n🗑️ Connection removed or request cancelled!");
    console.log("🔔 Connection ID:", data.connectionId);
    console.log("👤 Requester ID:", data.requesterId);
    console.log("👤 Receiver ID:", data.receiverId);
    console.log("📌 Previous status:", data.previousStatus);
    console.log("👤 Removed by user ID:", data.removedBy);
    console.log("📦 Full data:", JSON.stringify(data, null, 2));
});

// ===============================
// CONNECTION ERRORS
// ===============================
socket.on("connect_error", (error) => {
    console.error("❌ Connection error:", error.message);
});

socket.on("disconnect", (reason) => {
    console.log("🔌 Disconnected:", reason);
});

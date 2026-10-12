const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // In production, you can lock this down to your game domain
        methods: ["GET", "POST"]
    }
});

// Track active rooms: { levelId: { host: socketId, peers: Set([socketIds]) } }
const rooms = {};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Player joins a specific level room
    socket.on('join-room', (levelId) => {
        socket.join(levelId);

        if (!rooms[levelId]) {
            rooms[levelId] = { host: socket.id, peers: new Set() };
            socket.emit('role', 'host');
            console.log(`User ${socket.id} is now HOST for ${levelId}`);
        } else {
            rooms[levelId].peers.add(socket.id);
            socket.emit('role', 'peer');
            // Notify the host that a new peer has arrived
            io.to(rooms[levelId].host).emit('peer-joined', socket.id);
            console.log(`User ${socket.id} joined ${levelId} as PEER`);
        }
    });

    // WebRTC Signaling Relays
    socket.on('offer', ({ to, offer }) => {
        io.to(to).emit('offer', { from: socket.id, offer });
    });

    socket.on('answer', ({ to, answer }) => {
        io.to(to).emit('answer', { from: socket.id, answer });
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
        io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });

    // Handle disconnects, room cleanup, and host migration
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        for (const levelId in rooms) {
            const room = rooms[levelId];
            if (room.host === socket.id) {
                const peerArray = Array.from(room.peers);
                if (peerArray.length > 0) {
                    // Promote the next waiting player to host
                    room.host = peerArray[0];
                    room.peers.delete(room.host);
                    io.to(room.host).emit('role', 'host');
                    console.log(`Host migrated for ${levelId}. New host: ${room.host}`);
                } else {
                    // Room is completely empty, delete it
                    delete rooms[levelId];
                    console.log(`Room ${levelId} closed (empty).`);
                }
            } else if (room.peers.has(socket.id)) {
                room.peers.delete(socket.id);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});

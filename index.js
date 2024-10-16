import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const port = process.env.PORT;

// Enable CORS for all routes
app.use(cors());

app.get("/", (req, res) => {
  return res
    .status(200)
    .json({ success: true, message: "Socket api is running" });
});
app.get("/api/socket", (req, res) => {
  return res
    .status(200)
    .json({ success: true, message: "Socket api is running" });
});
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  },
});

var waiting_queue = [];
var active_sessions = [];
var messages = {};
var skipped_sessions = {};
var active_sessions_users = {};
console.log("messages", messages);
io.on("connection", (socket) => {
  var user_token = socket.id;
  socket.emit("getWaitingRooms", { waiting_queue, active_sessions_users });

  // Triggered when a peer hits the join room button.
  socket.on("join", (roomName) => {
    if (!roomName) return;
    const room = io.sockets.adapter.rooms.get(roomName);

    // room == undefined when no such room exists.
    if (room === undefined) {
      socket.join(roomName);
      socket.emit("created");
      messages[roomName] = [];
      if (waiting_queue.indexOf(roomName) == -1) {
        waiting_queue.push(roomName);
      }
      active_sessions_users[roomName] = [user_token];
      socket.emit("getWaitingRooms", {
        waiting_queue,
        active_sessions_users,
      });
      socket.broadcast.emit("getWaitingRooms", {
        waiting_queue,
        active_sessions_users,
      });
      // io.emit("getWaitingRooms", {
      //   waiting_queue,
      //   active_sessions_users,
      // });
    } else if (room.size === 1) {
      // room.size == 1 when one person is inside the room.
      socket.join(roomName);
      socket.emit("joined");
      waiting_queue.splice(waiting_queue.indexOf(roomName), 1);
      active_sessions.push(roomName);
      active_sessions_users[roomName].push(user_token);
      socket.emit("getWaitingRooms", {
        waiting_queue,
        active_sessions_users,
      });
      socket.broadcast.emit("getWaitingRooms", {
        waiting_queue,
        active_sessions_users,
      });
      // io.emit("getWaitingRooms", {
      //   waiting_queue,
      //   active_sessions_users,
      // });
    } else {
      // when there are already two people inside the room.
      socket.emit("full");
    }
  });

  // Triggered when the person who joined the room is ready to communicate.
  socket.on("ready", (roomName) => {
    socket.broadcast.to(roomName).emit("ready"); // Informs the other peer in the room.
  });

  // Triggered when server gets an icecandidate from a peer in the room.
  socket.on("ice-candidate", (candidate, roomName) => {
    console.log(candidate);
    socket.broadcast.to(roomName).emit("ice-candidate", candidate); // Sends Candidate to the other peer in the room.
  });

  // Triggered when server gets an offer from a peer in the room.
  socket.on("offer", (offer, roomName) => {
    socket.broadcast.to(roomName).emit("offer", offer); // Sends Offer to the other peer in the room.
  });

  // Triggered when server gets an answer from a peer in the room.
  socket.on("answer", (answer, roomName) => {
    socket.broadcast.to(roomName).emit("answer", answer); // Sends Answer to the other peer in the room.
  });

  socket.on("leave", (roomName) => {
    socket.leave(roomName);
    waiting_queue.push(roomName);
    active_sessions.splice(active_sessions.indexOf(roomName), 1);
    messages[roomName] = [];
    socket.broadcast.to(roomName).emit("leave");
    socket.emit("getWaitingRooms", { waiting_queue, active_sessions_users });
    socket.broadcast.emit("getWaitingRooms", {
      waiting_queue,
      active_sessions_users,
    });
    // io.emit("getWaitingRooms", { waiting_queue, active_sessions_users });
  });

  socket.on("onLeave", (roomName) => {
    let arr = [];
    console.log("roomName", roomName);
    arr = waiting_queue.filter((id) => id !== roomName);

    waiting_queue = arr;

    // delete active_sessions_users.roomName;
    socket.broadcast.emit("getWaitingRooms", {
      waiting_queue,
      active_sessions_users,
    });
    // io.emit("getWaitingRooms", {
    //   waiting_queue,
    //   active_sessions_users,
    // });
  });

  socket.on("skip", (roomName) => {
    // waiting_queue.push(roomName);
    active_sessions.splice(active_sessions.indexOf(roomName), 1);
    messages[roomName] = [];

    console.log("before skipping", skipped_sessions[user_token]);
    if (!skipped_sessions[user_token])
      skipped_sessions[user_token] = [roomName];
    else
      skipped_sessions[user_token].push(
        ...skipped_sessions[user_token],
        roomName
      );
    console.log("after skipping", skipped_sessions[user_token]);
    socket.emit("skipped_users", skipped_sessions[user_token]);
    // io.to(roomName).emit("skipped_users", skipped_sessions[user_token]);
    // io.emit("getWaitingRooms", { waiting_queue, active_sessions_users });
    // socket.leave(roomName);
    socket.broadcast
      .to(roomName)
      .emit("skipped_users", skipped_sessions[user_token]);
    socket.emit("getWaitingRooms", { waiting_queue, active_sessions_users });
    socket.broadcast
      .to(roomName)
      .emit("getWaitingRooms", { waiting_queue, active_sessions_users });
    socket.broadcast
      .to(roomName)
      .emit("getWaitingRooms", { waiting_queue, active_sessions_users });
    socket.broadcast.to(roomName).emit("leave", waiting_queue);
    socket.leave(roomName);
  });

  socket.on("skip_state", (roomName) => {
    if (waiting_queue?.length !== 0) {
      // if (Object.keys(active_sessions_users).length !== 1) {
      if (active_sessions_users[roomName]?.length === 2) {
        active_sessions_users[roomName].pop();
        waiting_queue.push(roomName);
        // socket.emit("getWaitingRooms", { waiting_queue, active_sessions_users });
        socket.to(roomName).emit("getWaitingRooms", {
          waiting_queue,
          active_sessions_users,
        });
      }
      // }
      // else {
      //   socket.to(roomName).emit("getWaitingRooms", {
      //     waiting_queue,
      //     active_sessions_users,
      //   });
      // }
    }
  });

  socket.on("end_call", (roomName) => {
    if (active_sessions_users[roomName]?.length === 2) {
      const waitingQueueFound =
        waiting_queue?.length > 0 && waiting_queue?.includes(roomName);
      active_sessions_users[roomName]?.pop();
      if (!waitingQueueFound) {
        waiting_queue.push(roomName);
      }
    } else {
      const waitingQueueFound = waiting_queue?.length > 0;
      waiting_queue?.includes(roomName);

      if (roomName in active_sessions_users) {
        delete active_sessions_users[roomName];
      }

      if (waitingQueueFound) {
        const arrayListData = waiting_queue?.filter(
          (queue) => queue !== roomName
        );
        waiting_queue = arrayListData;
      }
    }
    socket.broadcast.emit("getWaitingRooms", {
      waiting_queue,
      active_sessions_users,
    });
  });

  socket.on("message_send", (data) => {
    console.log("message_send", data, Array.isArray(messages[data.roomName]));
    if (!Array.isArray(messages[data.roomName])) messages[data.roomName] = [];
    console.log("sender", socket.id, messages);
    messages[data.roomName].push({
      sender: socket.id,
      message: data.message,
    });

    socket.broadcast
      .to(data.roomName)
      .emit("message_recieved", messages[data.roomName]);
  });
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

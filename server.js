const express = require('express'),
    io = require('socket.io'),
    ytdl = require('ytdl-core');

let app = express(),
    socket;

let rooms = []; // array of rooms

function initRoom(client) {
    let roomNumber = 1 + Math.random() * 100000 | 0, unique;

    do {
        unique = true;
        for (let i = 0; i < rooms.length; i++) {
            if (rooms[i].roomNumber == roomNumber) {
                unique = false;
                roomNumber = Math.random() * 10000 | 0;
                break;
            }
        }
    } while (!unique);

    rooms.push({
        roomNumber: roomNumber,
        hostId: client.id
    });

    console.log("Creating room with host " + client.id + " and room number " + roomNumber);

    return roomNumber;
}

function getRoomByHost(host) {
    for (let i = 0; i < rooms.length; i++) {
        if (rooms[i].hostId == host) {
            return rooms[i];
        }
    }
    return null;
}

function getRoomIndexByNumber(number) {
    for (let i = 0; i < rooms.length; i++) {
        if (rooms[i].roomNumber == number) {
            return i;
        }
    }
    return -1;
}

socket = io(app.listen(process.env.PORT || 8080, function () {
    console.log("Server running at port " + this.address().port);
}));

socket.on("connection", function (client) {
    console.log("Connection from id " + client.id);

    client.on("disconnect", function (client) {
        let roomNumber = getRoomByHost(client.id);

        // If this user is a host, disconnect all the clients in the room
        if (roomNumber !== null) {
            io.sockets.clients(String(roomNumber)).forEach(function (s) {
                s.disconnect(true);
            });

            let index = getRoomIndexByNumber(roomNumber);
            rooms.splice(index, 1);

            console.log("Room " + roomNumber + "removed.");
        }

    });

    // CLIENT EVENTS

    client.on("client_join", function (roomNumber, name) {
        let index = getRoomIndexByNumber(roomNumber);
        if (index > -1) {
            // Join the room if it exists
            client.join(String(roomNumber));
            socket.to(rooms[index].hostId).emit("client_join", name);
        }
    });

    // HOST EVENTS

    client.on("host_start", function () {
        let roomNumber = initRoom(client);
        client.join(String(roomNumber));
        client.emit("code_assignment", roomNumber);
    });

    client.on("pause", function (timestamp) {
        let roomNumber = getRoomByHost(client.id);
        if (roomNumber !== null) {
            socket.to(String(roomNumber)).emit("pause", { "timestamp": timestamp });
        }
    });

    client.on("play", function (timestamp) {
        let roomNumber = getRoomByHost(client.id);
        if (roomNumber !== null) {
            socket.to(String(roomNumber)).emit("play");
        }
    });

    client.on("video_url", function (url) {
        let roomNumber = getRoomByHost(client.id);
        if (roomNumber !== null) {
            ytdl.getInfo(url, function (err, info) {
                socket.to(String(roomNumber)).emit("video_url", { "url": info.formats[0].url });
            });
        }
    });
});
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
        hostId: client.id,
        clients: [],
    });

    console.log("Creating room with host " + client.id + " and room number " + roomNumber);

    return roomNumber;
}

function getRoomNumberByHostId(host) {
    for (let i = 0; i < rooms.length; i++) {
        if (rooms[i].hostId === host) {
            return rooms[i].roomNumber;
        }
    }
    return null;
}

function getRoomIndexByRoomNumber(number) {
    for (let i = 0; i < rooms.length; i++) {
        if (rooms[i].roomNumber == number) {
            return i;
        }
    }
    return -1;
}

function getRoomIndexByClientId(id) {
    for (let i = 0; i < rooms.length; i++) {
        for(let j = 0; j < rooms[i].clients.length; j++) {
            if(rooms[i].clients[j].id === id) {
                return i;
            }
        }
    }

    return -1;
}

function roomAllReady(roomNumber) {
    let index = getRoomIndexByRoomNumber(roomNumber);

    for(let i = 0; i < rooms[index].clients.length; i++) {
        if(rooms[index].clients[i].ready === false) {
            return false;
        }
    }

    return true;
}

// Initialize socket.io

socket = io(app.listen(process.env.PORT || 8080, function () {
    console.log("Server running on port " + this.address().port);
}));

// Socket listeners

socket.on("connection", function (client) {
    console.log("Connection from id " + client.id);

    client.on("disconnect", function (client) {
        let roomNumber = getRoomNumberByHostId(client.id);

        // If this user is a host, disconnect all the clients in the room
        if (roomNumber !== null) {
            io.sockets.clients(String(roomNumber)).forEach(function (s) {
                s.disconnect(true);
            });

            let index = getRoomIndexByRoomNumber(roomNumber);
            rooms.splice(index, 1);

            console.log("Room " + roomNumber + "removed.");
        }
    });

    // CLIENT EVENTS

    client.on("client_join", function (roomNumber, name) {
        let index = getRoomIndexByRoomNumber(roomNumber);
        if (index > -1) {
            // Join the room if it exists
            client.join(String(roomNumber));
            rooms[index].clients.push({id: client.id, name: name, ready: false});

            socket.to(rooms[index].hostId).emit("client_join", name);
            console.log("Client " + name + " joined room " + roomNumber);
        }
    });

    client.on("ready", function() {
        let index = getRoomIndexByClientId(client.id);
        if(index === -1) {
            return;
        }

        for(let i = 0; i < rooms[index].clients.length; i++) {
            if(rooms[index].clients[i].id === client.id) {
                rooms[index].clients[i].ready = true;
                console.log("Client " + clients[i].name + " is ready.");
                break;
            }
        }

        if(roomAllReady(getRoomIndexByClientId(client.id))) {
            console.log("Room " + rooms[index].roomNumber + " is all ready!");
            socket.to(rooms[index].hostId).emit("all_ready"); 
        }
    });

    // HOST EVENTS

    client.on("host_start", function () {
        let roomNumber = initRoom(client);
        client.join(String(roomNumber));
        client.emit("code_assignment", roomNumber);
    });

    client.on("pause", function (timestamp) {
        let roomNumber = getRoomNumberByHostId(client.id);
        if (roomNumber !== null) {
            socket.to(String(roomNumber)).emit("pause", { "timestamp": timestamp });
        }

        console.log("Pause requested for room " + roomNumber);
    });

    client.on("play", function () {
        let roomNumber = getRoomNumberByHostId(client.id);
        if (roomNumber !== null) {
            socket.to(String(roomNumber)).emit("play");
        }

        console.log("Play requested for room " + roomNumber);
    });

    client.on("video_url", function (url) {
        let roomNumber = getRoomNumberByHostId(client.id);
        if (roomNumber !== null) {
            ytdl.getInfo(url, function (err, info) {
                socket.to(String(roomNumber)).emit("video_url", { "url": info.formats[0].url });
            });
        }

        console.log("Broadcasted a YT download link.");
    });

    client.on("registration_complete", function() {
        let index = getRoomIndexByRoomNumber(getRoomNumberByHostId(client.id));
        if(index === -1 ) {
            return;
        }
        console.log("Registration complete for host " + client.id);
        client.emit("clients", {clients: rooms[index].clients});
    });

    client.on("positions", function(positionInfo) {
        let rows = positionInfo.rows, 
            cols = positionInfo.cols,
            width = 1 / cols,
            height = 1 / rows;
        
        for(let i = 0; i < positionInfo.device_positions.length; i++) {
            let originX = positionInfo.device_positions[i].col * width,
                originY = positionInfo.device_positions[i].row * height;
            
            socket.to(positionInfo.device_positions[i].id).emit("position", originX, originY, width, height);
        }

        console.log("Received position info.");
        console.log(positionInfo);
    });
});
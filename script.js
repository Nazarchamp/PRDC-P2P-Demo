// Configure URL for random room generation -----------------------------------
// This part was not included in the presentation and is here as an extra
const urlParams = new URLSearchParams(window.location.search);
const roomID = urlParams.get('room');

if(roomID === null){
  window.location.href = location.protocol + '//' + location.host + location.pathname + "?room=" + btoa(Math.floor(Math.random()*2315).toString().padStart(6, '0')) ;
}
// ----------------------------------------------------------------------------

// Post a recieved message to the messages area
function postToDOM(strToPost){
  let newElement = document.createElement("div");
  newElement.classList.add("post");
  newElement.innerHTML = `
      <p class="post-text">Recieved: ${strToPost}</p>  
  `;
  document.getElementById("post-container").appendChild(newElement);
}

// Configure a send button that sends and adds text to the messages area
function configSendBtn(channel) {
  document.getElementById("post-btn").onclick = () => {
    channel.send(document.getElementById("post-textarea").value);
    let newElement = document.createElement("div");
    newElement.classList.add("post");
    newElement.innerHTML = `
       <p class="post-text">Sent: ${document.getElementById("post-textarea").value}</p>  
    `;
    document.getElementById("post-container").appendChild(newElement);
  };
}

// Send signaling data via Scaledrone
function sendMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}

// Enter your own ScaleDrone channel ID
const drone = new ScaleDrone(/* Here */);


// Setup Roomname and Config
const roomName = `observable-PRDC-ROOM-${roomID}`;
const configuration = {
  iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
}

// Variables for later
let room;
let pc;


// When ScaleDrone opens, subscribe to room and determine if we are the offerer
drone.on('open', () => {
  room = drone.subscribe(roomName);
  room.on('members', members => {
    const isOfferer = members.length === 2;
    startWebRTC(isOfferer);
  });
});


function startWebRTC(isOfferer) {
  pc = new RTCPeerConnection(configuration);

  // Create an event for when we need to communicate via our signalling server
  pc.onicecandidate = event => {
    if (event.candidate) {
      sendMessage({'candidate': event.candidate});
    }  
  };

  // If we are going to be the offerer
  if (isOfferer) {
    // When it's time for negotiation send our local desc
    pc.onnegotiationneeded = () => {
      pc.createOffer().then(localDescCreated);
    }
    
    // Create the channel through which we're going to communicate
    const channel = pc.createDataChannel("chat");
    
    // When a message is recieved post
    channel.onmessage = (ev) => {
      postToDOM(ev.data);      
    }
    configSendBtn(channel);

  } else { // If we're not the offerer, meaning we don't open the channel
    // On data channel opening
    pc.ondatachannel = (ev) => {
      const channel = ev.channel;
      // When a message is recieved post
      channel.onmessage = (ev) => {
        postToDOM(ev.data);
      };
      configSendBtn(channel);
    }
  }

  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    // Check if we're the senders
    if (client.id === drone.clientId) {
      return;
    }

    // If not our SDP message is recieved
    if (message.sdp) {
      // Set our remote description
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        // If we have an offer answer it
        if (pc.remoteDescription.type === 'offer'){
          pc.createAnswer().then(localDescCreated);
        }
      })
    } else if (message.candidate) {
      // Add the ICE candidate to our connection
      pc.addIceCandidate(new RTCIceCandidate(message.candidate))
    }
  });
}

// Update Local Description
function localDescCreated(desc) {
  pc.setLocalDescription(
    desc,
    () => sendMessage({'sdp': pc.localDescription}),
  );
}


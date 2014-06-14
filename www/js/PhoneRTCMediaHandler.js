var PhoneRTCMediaHandler = function(session, options) {
  var events = [
  ];
  options = options || {};

  this.logger = session.ua.getLogger('sip.invitecontext.mediahandler', session.id);
  this.session = session;
  this.localMedia = null;
  this.ready = true;
  this.mediaStreamManager = SIP.WebRTC.MediaStreamManager.cast(options.mediaStreamManager);
  this.audioMuted = false;
  this.videoMuted = false;

  // old init() from here on
  var idx, length, server,
    servers = [],
    stunServers = options.stunServers || null,
    turnServers = options.turnServers || null,
    config = this.session.ua.configuration;
  this.RTCConstraints = options.RTCConstraints || {};

  if (!stunServers) {
    stunServers = config.stunServers;
  }

  if(!turnServers) {
    turnServers = config.turnServers;
  }

  /* Change 'url' to 'urls' whenever this issue is solved:
   * https://code.google.com/p/webrtc/issues/detail?id=2096
   */
  servers.push({'url': stunServers});

  length = turnServers.length;
  for (idx = 0; idx < length; idx++) {
    server = turnServers[idx];
    servers.push({
      'url': server.urls,
      'username': server.username,
      'credential': server.password
    });
  }

  this.initEvents(events);

  this.phonertc = {};
};

PhoneRTCMediaHandler.prototype = Object.create(SIP.MediaHandler.prototype, {
// Functions the session can use
  isReady: {writable: true, value: function isReady () {
    return this.ready;
  }},

  close: {writable: true, value: function close () {
    this.logger.log('closing PeerConnection');
    // have to check signalingState since this.close() gets called multiple times
    // TODO figure out why that happens
    if(this.peerConnection && this.peerConnection.signalingState !== 'closed') {
      this.peerConnection.close();

      if(this.localMedia) {
        this.mediaStreamManager.release(this.localMedia);
      }
    }
  }},

  /**
   * @param {Function} onSuccess
   * @param {Function} onFailure
   * @param {SIP.WebRTC.MediaStream | (getUserMedia constraints)} [mediaHint]
   *        the MediaStream (or the constraints describing it) to be used for the session
   */
  getDescription: {writable: true, value: function getDescription (onSuccess, onFailure, mediaHint) {
                    onFailure = onFailure;
                    mediaHint = mediaHint;
    if (!this.phonertc.role) {
      this.phonertcCall('caller');
    }

    var pcDelay = 2000;
    setTimeout(function () {
      var sdp = this.phonertc.localSdp;
      if (this.phonertc.role !== 'caller') {
        sdp = sdp.replace('a=setup:actpass', 'a=setup:passive');
      }
      sdp = sdp.replace(/a=crypto.*\r\n/g, '');
      onSuccess(sdp);
    }.bind(this), pcDelay);
  }},

  phonertcSendMessageCallback: {writable: true, value: function phonertcSendMessageCallback (data) {
    this.logger.log("XXX phonertcSendMessageCallback: " + JSON.stringify(data, null, 2));
    if (['offer', 'answer'].indexOf(data.type) > -1) {
      this.phonertc.localSdp = data.sdp;
    }
    else if (data.type === 'candidate') {
      this.phonertc.localSdp += data.candidate;
    }
  }},

  phonertcCall: {writable: true, value: function phonertcCall (role) {
    this.logger.log("XXX phonertcCall: " + role);
    this.phonertc.role = role;
    cordova.plugins.phonertc.call({
      isInitator: role === 'caller', // Caller or callee?
      turn: {
        host: 'turn:turn.example.com:3478',
        username: 'user',
        password: 'pass'
      },
      sendMessageCallback: this.phonertcSendMessageCallback.bind(this),
      answerCallback: function () {
        window.alert('Callee answered!');
      },
      disconnectCallback: function () {
        window.alert('Call disconnected!');
      }
    });
  }},

  /**
  * Message reception.
  * @param {String} type
  * @param {String} sdp
  * @param {Function} onSuccess
  * @param {Function} onFailure
  */
  setDescription: {writable: true, value: function setDescription (sdp, onSuccess, onFailure) {
    function setRemoteDescription (type, sdp) {
      this.logger.log("XXX setRemoteDescription: " + type + "\n" + sdp);
      cordova.plugins.phonertc.receiveMessage({type: type, sdp: sdp});
      onSuccess();
    }

    if (!this.phonertc.role) {
      this.phonertcCall('callee');
      var pcDelay = 2000;
      setTimeout(setRemoteDescription.bind(this, 'offer', sdp), pcDelay);
    }
    else if (this.phonertc.role = 'caller') {
      setRemoteDescription.call(this, 'answer', sdp);
    }
    else {
      this.logger.error('XXX setDescription called, but this.phonertc.role = ' + this.phonertc.role);
      onFailure();
    }
  }},

// Functions the session can use, but only because it's convenient for the application
  isMuted: {writable: true, value: function isMuted () {
    return {
      audio: this.audioMuted,
      video: this.videoMuted
    };
  }},

  mute: {writable: true, value: function mute (options) {
          options = options;
  }},

  unmute: {writable: true, value: function unmute (options) {
            options = options;
  }},

  hold: {writable: true, value: function hold () {
    this.toggleMuteAudio(true);
    this.toggleMuteVideo(true);
  }},

  unhold: {writable: true, value: function unhold () {
    if (!this.audioMuted) {
      this.toggleMuteAudio(false);
    }

    if (!this.videoMuted) {
      this.toggleMuteVideo(false);
    }
  }},

// Functions the application can use, but not the session
  getLocalStreams: {writable: true, value: function getLocalStreams () {
    var pc = this.peerConnection;
    if (pc && pc.signalingState === 'closed') {
      this.logger.warn('peerConnection is closed, getLocalStreams returning []');
      return [];
    }
    return (pc.getLocalStreams && pc.getLocalStreams()) ||
      pc.localStreams || [];
  }},

  getRemoteStreams: {writable: true, value: function getRemoteStreams () {
    var pc = this.peerConnection;
    if (pc && pc.signalingState === 'closed') {
      this.logger.warn('peerConnection is closed, getRemoteStreams returning []');
      return [];
    }
    return(pc.getRemoteStreams && pc.getRemoteStreams()) ||
      pc.remoteStreams || [];
  }},

// Internal functions
  hasOffer: {writable: true, value: function hasOffer (where) {
    var offerState = 'have-' + where + '-offer';
    return this.peerConnection.signalingState === offerState;
    // TODO consider signalingStates with 'pranswer'?
  }},

  createOfferOrAnswer: {writable: true, value: function createOfferOrAnswer (onSuccess, onFailure, constraints) {
    var self = this;

    function readySuccess () {
      var sdp = self.peerConnection.localDescription.sdp;

      sdp = SIP.Hacks.Chrome.needsExplicitlyInactiveSDP(sdp);

      self.ready = true;
      onSuccess(sdp);
    }

    function onSetLocalDescriptionSuccess() {
      if (self.peerConnection.iceGatheringState === 'complete' && self.peerConnection.iceConnectionState === 'connected') {
        readySuccess();
      } else {
        self.onIceCompleted = function() {
          self.logger.log('ICE Gathering Completed');
          self.onIceCompleted = undefined;
          readySuccess();
        };
      }
    }

    function methodFailed (methodName, e) {
      self.logger.error('peerConnection.' + methodName + ' failed');
      self.logger.error(e);
      self.ready = true;
      onFailure(e);
    }

    self.ready = false;

    var methodName = self.hasOffer('remote') ? 'createAnswer' : 'createOffer';

    self.peerConnection[methodName](
      function(sessionDescription){
        self.peerConnection.setLocalDescription(
          sessionDescription,
          onSetLocalDescriptionSuccess,
          methodFailed.bind(null, 'setLocalDescription')
        );
      },
      methodFailed.bind(null, methodName),
      constraints
    );
  }},

  addStream: {writable: true, value: function addStream (stream, onSuccess, onFailure, constraints) {
    try {
      this.peerConnection.addStream(stream, constraints);
    } catch(e) {
      this.logger.error('error adding stream');
      this.logger.error(e);
      onFailure(e);
      return;
    }

    onSuccess();
  }},

  toggleMuteHelper: {writable: true, value: function toggleMuteHelper (trackGetter, mute) {
                      trackGetter = trackGetter;
                      mute = mute;
  }},

  toggleMuteAudio: {writable: true, value: function toggleMuteAudio (mute) {
    this.toggleMuteHelper('getAudioTracks', mute);
  }},

  toggleMuteVideo: {writable: true, value: function toggleMuteVideo (mute) {
    this.toggleMuteHelper('getVideoTracks', mute);
  }}
});

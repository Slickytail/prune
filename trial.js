var EDIT_PROB = 0.1;
var CONNECT_PROB = 0.1;
var TIMING = 50;

class Trial {

    constructor(options) {
        this.debug = options.debug || false;
        this.n_peers = options.peers || 4;
        this.seed = options.seed || "seed";

        Math.randomSeed(this.seed);
        this.rand = () => Math.random();
        this.events = {};

        
        this.peers = {}
        for (var i = 0; i < this.n_peers; i++) {
            ;(() => {
                var p = sync9_create_peer({
                    get: (pid, id) => {
                        if (this.debug) console.log('SEND: ' + pid + ' get ' + id)
                        this.peers[pid].incoming.push([p.uid, () => {
                            if (this.debug) console.log('RECV: ' + pid + ' get ' + id)
                            this.peers[pid].get(p.uid, id)
                        }])
                    },
                    set: (pid, vid, parents, changes) => {
                        if (this.debug) console.log('SEND: ' + pid + ' set')
                        this.peers[pid].incoming.push([p.uid, () => {
                            if (this.debug) console.log('RECV: ' + pid + ' set')
                            this.peers[pid].set(p.uid, vid, parents, changes)
                        }])
                    },
                    set_multi: (pid, vs, fs) => {
                        fs = Object.assign({}, fs)
                        if (this.debug) console.log('SEND: ' + pid + ' set_multi')
                        this.peers[pid].incoming.push([p.uid, () => {
                            if (this.debug) console.log('RECV: ' + pid + ' set_multi')
                            this.peers[pid].set_multi(p.uid, vs, fs)
                        }])
                    },
                    ack: (pid, vid) => {
                        if (this.debug) console.log('SEND: ' + pid + ' ack ' + vid)
                        this.peers[pid].incoming.push([p.uid, () => {
                            if (this.debug) console.log('RECV: ' + pid + ' ack ' + vid)
                            this.peers[pid].ack(p.uid, vid)
                        }])
                    },
                    full_ack: (pid, vid) => {
                        if (this.debug) console.log('SEND: ' + pid + ' full_ack ' + vid)
                        this.peers[pid].incoming.push([p.uid, () => {
                            if (this.debug) console.log('RECV: ' + pid + ' full_ack ' + vid)
                            this.peers[pid].full_ack(p.uid, vid)
                        }])
                    },
                    fissure: (pid, fissure) => {
                        if (this.debug) console.log('SEND: ' + pid + ' fissure')
                        this.peers[pid].incoming.push([p.uid, () => {
                            if (this.debug) console.log('RECV: ' + pid + ' fissure')
                            this.peers[pid].fissure(p.uid, fissure)
                        }])
                    }
                })
                p.incoming = []
                this.peers[p.uid] = p
                
                if (i == 0) {
                    p.letters = 'abcdefghijklmnopqrstuvwxyz'
                    for (var ii = 0; ii < 100; ii++) {
                        p.letters += String.fromCharCode(12032 + ii)
                    }
                    p.letters_i = 0
                } else {
                    p.letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
                    for (var ii = 0; ii < 100; ii++) {
                        p.letters += String.fromCharCode(12032 + 100 + ii)
                    }
                    p.letters_i = 0
                }
            })()
        }
        this.peers_array = Object.values(this.peers)
        
        for (var p1 = 0; p1 < this.n_peers; p1++) {
            for (var p2 = p1 + 1; p2 < this.n_peers; p2++) {
                if (!this.peers_array[p1].peers[this.peers_array[p2].uid]) {
                    this.peers_array[p1].connect(this.peers_array[p2].uid)
                    this.peers_array[p2].connect(this.peers_array[p1].uid)
                }
            }
        }
    }

    _tick() {

        var i = Math.floor(this.rand() * this.n_peers)
        var p = this.peers_array[i]
        
        if (this.rand() < EDIT_PROB) {
            if (this.rand() > CONNECT_PROB) {
                if (p.letters_i >= p.letters.length) {
                    p.letters_i = 0
                }
                var e = this.create_random_edit(p.s9, p.letters[p.letters_i++])
                p.local_set(e.vid, e.parents, e.changes)
                this.emit("edit", p.uid, e)
            } else {
                var other_p = p
                while (other_p == p) {
                    other_p = this.peers_array[Math.floor(this.rand() * this.n_peers)]
                }
                if (p.peers[other_p.uid]) {
                    p.disconnect(other_p.uid)
                    p.incoming = p.incoming.filter(x => x[0] != other_p.uid)
                    other_p.disconnect(p.uid)
                    other_p.incoming = other_p.incoming.filter(x => x[0] != p.uid)
                } else {
                    p.connect(other_p.uid)
                    other_p.connect(p.uid)
                }
                this.emit("topology", this.peers)
            }
        } else {
            if (this.debug) console.log('process incoming')
            var did_something = false
            if (p.incoming.length > 0) {
                did_something = true
                p.incoming.shift()[1]()
            }
            if (!did_something) {
                if (this.debug) console.log('did nothing')
            }
        }
        
        if (this.debug)
            console.log('peer: ' + p.uid + ' -> ' + JSON.stringify(sync9_read(p.s9)))

        this.emit("tick", p)
        
        setTimeout(() => this._tick(), TIMING);
    }
    
    begin() {
        setTimeout(() => this._tick(), 0);
    }

    create_random_edit(s, letters) {
        letters = letters || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
        var str = sync9_read(s)
        var start = Math.floor(this.rand() * (str.length + 1))
        var del = Math.floor(this.rand() * Math.random() * (str.length - start + 1))
        var ins = letters[Math.floor(this.rand() * letters.length)].repeat(Math.floor(this.rand() * 4) + (del == 0 ? 1 : 0))
        
        var vid = sync9_guid()
        var changes = [`[${start}:${start + del}] = ` + JSON.stringify(ins)]
        
        return {
            vid : vid,
            parents : Object.assign({}, s.leaves),
            changes : changes
        }
    }

    on(event, handler) {
        if (!["tick", "topology", "edit"].includes(event))
            throw "Unknown Event"
        this.events[event] = handler
    }

    emit(event, ...args) {
        if (this.events[event])
            this.events[event](...args);
    }

}
var EDIT_PROB = 0.1;
var CONNECT_PROB = 0.1;
var BANDWIDTH = 1;
var TIMING = 50;
var LATENCY = 2;
var DEBUG = false;

class Trial {

    constructor(options) {
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
                        if (DEBUG) console.log(`SEND [${p.uid}]: ` + pid + ' get ' + id)
                        this.peers[pid].incoming.push([p.uid, () => {
                            if (DEBUG) console.log(`RECV [${p.uid}]: ` + pid + ' get ' + id)
                            this.peers[pid].get(p.uid, id)
                        }, LATENCY])
                    },
                    set: (pid, vid, parents, changes) => {
                        if (DEBUG) console.log(`SEND [${p.uid}]: ` + pid + ' set ' + vid)
                        this.peers[pid].incoming.push([p.uid, () => {
                            if (DEBUG) console.log(`RECV [${p.uid}]: ` + pid + ' set ' + vid)
                            this.peers[pid].set(p.uid, vid, parents, changes)
                        }, LATENCY])
                    },
                    set_multi: (pid, vs, fs) => {
                        fs = Object.assign({}, fs)
                        if (DEBUG) console.log(`SEND [${p.uid}]: ` + pid + ' set_multi')
                        this.peers[pid].incoming.push([p.uid, () => {
                            if (DEBUG) console.log(`RECV [${p.uid}]: ` + pid + ' set_multi')
                            this.peers[pid].set_multi(p.uid, vs, fs)
                        }, LATENCY])
                    },
                    ack: (pid, vid) => {
                        if (DEBUG) console.log(`SEND [${p.uid}]: ` + pid + ' ack ' + vid)
                        this.peers[pid].incoming.push([p.uid, () => {
                            if (DEBUG) console.log(`RECV [${p.uid}]: ` + pid + ' ack ' + vid)
                            this.peers[pid].ack(p.uid, vid)
                        }, LATENCY])
                    },
                    full_ack: (pid, vid) => {
                        if (DEBUG) console.log(`SEND [${p.uid}]: ` + pid + ' full_ack ' + vid)
                        this.peers[pid].incoming.push([p.uid, () => {
                            if (DEBUG) console.log(`RECV [${p.uid}]: ` + pid + ' full_ack ' + vid)
                            this.peers[pid].full_ack(p.uid, vid)
                        }, LATENCY])
                    },
                    fissure: (pid, fissure) => {
                        if (DEBUG) console.log(`SEND [${p.uid}]: ` + pid + ' fissure')
                        this.peers[pid].incoming.push([p.uid, () => {
                            if (DEBUG) console.log(`RECV [${p.uid}]: ` + pid + ' fissure')
                            this.peers[pid].fissure(p.uid, fissure)
                        }, LATENCY])
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

        this.edit_counter = 0;
        this.fis_counter = 0;

        this.next_edit = 0;
        this.next_net = 0;
    }

    _tick() {
        this.next_net = (this.next_net + 1) % this.n_peers;
        var p = this.peers_array[this.next_net];

        p.incoming.forEach((f, i, a) => a[i][2]--);
        for (let i = 0; i < BANDWIDTH
                     && p.incoming.length > 0
                     && p.incoming[0][2] <= 0;
                i++) {
            p.incoming.shift()[1]()
        }

        this.edit_counter = (this.edit_counter + 1) % (1 / EDIT_PROB);
        // make an edit
        if (this.edit_counter < 1) {
            // pick the next peer
            let pe = this.peers_array[this.next_edit];
            this.next_edit = (this.next_edit + 1) % this.n_peers;
            // make a random edit
            pe.letters_i = (pe.letters_i + 1) % pe.letters.length;
            let e = this.create_random_edit(pe.s9, pe.letters[pe.letters_i]);
            pe.local_set(e.vid, e.parents, e.changes);

            this.emit("edit", pe.uid, e);
        }

        this.fis_counter = (this.fis_counter + 1) % (1 / CONNECT_PROB);
        // make a disconnect or reconnect
        if (this.fis_counter < 1) {
            // pick a random other peer
            let pf = p;
            while (pf == p) {
                pf = this.peers_array[Math.floor(this.rand() * this.n_peers)]
            }
            // if they're connected, disconnect them
            if (p.peers[pf.uid]) {
                p.disconnect(pf.uid)
                p.incoming = p.incoming.filter(x => x[0] != pf.uid)
                pf.disconnect(p.uid)
                pf.incoming = pf.incoming.filter(x => x[0] != p.uid)
            // if they aren't connected, connect them
            } else {
                p.connect(pf.uid)
                pf.connect(p.uid)
            }

            this.emit("topology", this.peers)
        }
        
        if (DEBUG)
            console.log('peer: ' + p.uid + ' -> ' + JSON.stringify(sync9_read(p.s9)))

        this.emit("tick", p);
        
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
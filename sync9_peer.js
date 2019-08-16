function sync9_create_peer(p_funcs) {
    var self = {}
    
    self.s9 = sync9_create()
    self.uid = sync9_guid()
    
    // work here : creating single string within json
    if (true) {
        sync9_add_version(self.s9, 'v1', {root: true}, [' = ""'])
        sync9_prune(self.s9, (a, b) => true, (a, b) => true)
        delete self.s9.T.v1
        self.s9.leaves = {root: true}
    }
    
    self.peers = {}
    self.fissures = {}
    self.conn_leaves = {}
    self.ack_leaves = {}
    self.phase_one = {}
    
    self.connect = pid => {
        self.peers[pid] = {a: sync9_guid()}
        p_funcs.get(pid, self.peers[pid].a)
    }
    
    self.disconnect = pid => {
        if (!self.peers[pid]) return
        if (self.peers[pid].b) {
            var open_fissures = {}
            Object.entries(self.fissures).forEach(x => {
                if (!self.fissures[x[1].b + ':' + x[1].a]) {
                    open_fissures[x[0]] = true
                }
            })
            
            var nodes = {}
            var ack_nodes = sync9_get_ancestors(self.s9, self.ack_leaves)
            Object.keys(self.s9.T).forEach(v => {
                if (!ack_nodes[v] || self.ack_leaves[v]) {
                    nodes[v] = true
                }
            })
            
            self.fissure(pid, {
                a: self.peers[pid].a,
                b: self.peers[pid].b,
                nodes,
                parents: open_fissures
            })
        }
        delete self.peers[pid]
    }
    
    function get_true_peers() {
        return Object.entries(self.peers).filter(x => x[1].b).map(x => x[0])
    }
    
    self.fissure = (pid, fissure) => {
        var key = fissure.a + ':' + fissure.b
        if (!self.fissures[key]) {
            self.fissures[key] = fissure
            
            self.phase_one = {}
            
            get_true_peers().forEach(p => {
                if (p != pid) p_funcs.fissure(p, fissure)
            })
        }
    }
    
    self.get = (pid, id) => {
        self.peers[pid].b = id
        var vs = sync9_extract_versions(self.s9, x => x == 'root')
        var fs = Object.values(self.fissures)
        p_funcs.set_multi(pid, vs, fs)
    }
    
    self.set_multi = (pid, vs, fs, conn_leaves, min_leaves) => {
        var new_vs = []
        var vs_T = {}
        vs.forEach(v => vs_T[v.vid] = v.parents)
        vs.forEach(v => {
            if (self.s9.T[v.vid]) {
                function f(v) {
                    if (vs_T[v]) {
                        Object.keys(vs_T[v]).forEach(f)
                        delete vs_T[v]
                    }
                }
                f(v.vid)
            }
        })
        vs.forEach(v => {
            if (vs_T[v.vid]) {
                new_vs.push(v)
                sync9_add_version(self.s9, v.vid, v.parents, v.changes)
            }
        })
        
        var new_fs = []
        fs.forEach(f => {
            var key = f.a + ':' + f.b
            if (!self.fissures[key]) {
                new_fs.push(f)
                self.fissures[key] = f
            }
        })
        
        if (!conn_leaves) {
            conn_leaves = Object.assign({}, self.s9.leaves)
        }
        var our_conn_nodes = sync9_get_ancestors(self.s9, self.conn_leaves)
        var new_conn_nodes = sync9_get_ancestors(self.s9, conn_leaves)
        Object.keys(self.conn_leaves).forEach(x => {
            if (new_conn_nodes[x] && !conn_leaves[x]) {
                delete self.conn_leaves[x]
            }
        })
        Object.keys(conn_leaves).forEach(x => {
            if (!our_conn_nodes[x]) self.conn_leaves[x] = true
        })
        
        if (!min_leaves) {
            min_leaves = {}
            var min = vs.filter(v => !vs_T[v.vid])
            min.forEach(v => min_leaves[v.vid] = true)
            min.forEach(v => {
                Object.keys(v.parents).forEach(p => {
                    delete min_leaves[p]
                })
            })
        }
        var min_nodes = sync9_get_ancestors(self.s9, min_leaves)
        var ack_nodes = sync9_get_ancestors(self.s9, self.ack_leaves)
        Object.keys(self.ack_leaves).forEach(x => {
            if (!min_nodes[x]) {
                delete self.ack_leaves[x]
            }
        })
        Object.keys(min_leaves).forEach(x => {
            if (ack_nodes[x]) self.ack_leaves[x] = true
        })
        
        self.phase_one = {}
        
        if (new_vs.length > 0 || new_fs.length > 0) {
            get_true_peers().forEach(p => {
                if (p != pid) p_funcs.set_multi(p, new_vs, new_fs, conn_leaves, min_leaves)
            })
        }
    }
    
    function add_full_ack_leaf(vid) {
        var marks = {}
        function f(v) {
            if (!marks[v]) {
                marks[v] = true
                delete self.conn_leaves[v]
                delete self.ack_leaves[v]
                delete self.phase_one[v]
                Object.keys(self.s9.T[v]).forEach(f)
            }
        }
        f(vid)
        self.ack_leaves[vid] = true
        self.prune()
    }
    
    self.local_set = (vid, parents, changes) => {
        sync9_add_version(self.s9, vid, parents, changes)
        var ps = get_true_peers()
        self.phase_one[vid] = {origin: null, count: ps.length}
        ps.forEach(p => {
            p_funcs.set(p, vid, parents, changes)
        })
        check_ack_count(vid)
    }
    
    self.set = (pid, vid, parents, changes) => {
        if (!self.s9.T[vid]) {
            sync9_add_version(self.s9, vid, parents, changes)
            
            var ps = get_true_peers()
            self.phase_one[vid] = {origin: pid, count: ps.length - 1}
            ps.forEach(p => {
                if (p != pid)
                    p_funcs.set(p, vid, parents, changes)
            })
        } else if (self.phase_one[vid]) {
            self.phase_one[vid].count--
        }
        check_ack_count(vid)
    }
    
    self.ack = (pid, vid) => {
        if (self.phase_one[vid]) {
            self.phase_one[vid].count--
            check_ack_count(vid)
        }
    }
    
    function check_ack_count(vid) {
        if (self.phase_one[vid] && self.phase_one[vid].count == 0) {
            if (self.phase_one[vid].origin)
                p_funcs.ack(self.phase_one[vid].origin, vid)
            else {
                add_full_ack_leaf(vid)
                get_true_peers().forEach(p => {
                    p_funcs.full_ack(p, vid)
                })
            }
        }
    }
    
    self.full_ack = (pid, vid) => {
        if (!self.s9.T[vid]) return
        
        var ancs = sync9_get_ancestors(self.s9, self.conn_leaves)
        if (ancs[vid]) return
        
        var ancs = sync9_get_ancestors(self.s9, self.ack_leaves)
        if (ancs[vid]) return
        
        add_full_ack_leaf(vid)
        get_true_peers().forEach(p => {
            if (p != pid) p_funcs.full_ack(p, vid)
        })
    }
    
    self.prune = () => {
        var tags = {}
        var frozen = {root: true}
        Object.keys(self.s9.T).forEach(vid => {
            tags[vid] = {tags: {}}
        })
        function tag(vid, t) {
            if (!tags[vid].tags[t]) {
                tags[vid].tags[t] = true
                Object.keys(self.s9.T[vid]).forEach(vid => tag(vid, t))
            }
        }
        Object.entries(self.fissures).forEach(x => {
            Object.keys(x[1].nodes).forEach(v => {
                if (!self.s9.T[v]) return
                tag(v, v)
                frozen[v] = true
                Object.keys(self.s9.T[v]).forEach(v => {
                    tag(v, v)
                    frozen[v] = true
                })
            })
        })
        var acked = sync9_get_ancestors(self.s9, self.ack_leaves)
        Object.keys(self.s9.T).forEach(x => {
            if (!acked[x] || self.ack_leaves[x]) {
                tag(x, x)
                frozen[x] = true
                Object.keys(self.s9.T[x]).forEach(v => {
                    tag(v, v)
                    frozen[v] = true
                })
            }
        })
        Object.entries(tags).forEach(x => {
            var keys = Object.keys(x[1].tags)
            if (keys.length == 0) {
                frozen[x[0]] = true
            } else if (!frozen[x[0]]) {
                x[1].tag = keys.sort().join(',')
            }
        })
        var q = (a, b) => !frozen[a] && !frozen[b] && (tags[a].tag == tags[b].tag)
        sync9_prune2(self.s9, q)
        
        var unremovable = {}
        Object.entries(self.fissures).forEach(x => {
            if (!self.fissures[x[1].b + ':' + x[1].a]) {
                function f(y) {
                    if (!unremovable[y.a + ':' + y.b]) {
                        unremovable[y.a + ':' + y.b] = true
                        unremovable[y.b + ':' + y.a] = true
                        Object.keys(y.parents).forEach(p => {
                            if (self.fissures[p]) f(self.fissures[p])
                        })
                    }
                }
                f(x[1])
            }
        })
        
        var acked = sync9_get_ancestors(self.s9, self.ack_leaves)
        var done = {}
        Object.entries(self.fissures).forEach(x => {
            var other_key = x[1].b + ':' + x[1].a
            var other = self.fissures[other_key]
            if (other && !done[x[0]] && !unremovable[x[0]]) {
                done[x[0]] = true
                done[other_key] = true
                
                if (Object.keys(x[1].nodes).every(x => acked[x] || !self.s9.T[x])) {
                    delete self.fissures[x[0]]
                    delete self.fissures[other_key]
                }
            }
        })
    }
    self.v_state = () => {
        var tags = {}
        var frozen = {root: true}
        Object.keys(self.s9.T).forEach(vid => {
            tags[vid] = {tags: {}}
        })
        function tag(vid, t) {
            if (!tags[vid].tags[t]) {
                tags[vid].tags[t] = true
                Object.keys(self.s9.T[vid]).forEach(vid => tag(vid, t))
            }
        }
        Object.entries(self.fissures).forEach(x => {
            Object.keys(x[1].nodes).forEach(v => {
                if (!self.s9.T[v]) return
                tag(v, v)
                frozen[v] = true
                Object.keys(self.s9.T[v]).forEach(v => {
                    tag(v, v)
                    frozen[v] = true
                })
            })
        })
        var acked = sync9_get_ancestors(self.s9, self.ack_leaves)
        Object.keys(self.s9.T).forEach(x => {
            if (!acked[x] || self.ack_leaves[x]) {
                tag(x, x)
                frozen[x] = true
                Object.keys(self.s9.T[x]).forEach(v => {
                    tag(v, v)
                    frozen[v] = true
                })
            }
        })
        Object.entries(tags).forEach(x => {
            var keys = Object.keys(x[1].tags)
            if (keys.length == 0) {
                frozen[x[0]] = true
            } else if (!frozen[x[0]]) {
                x[1].tag = keys.sort().join(',')
            }
        })
        
        return function(a) {
            return {
                frozen: frozen[a] || false,
                acked: acked[a] || false
            }
        }
    }

    self.f_state = () => {
        var states = {};
        function fis(f) {
            let m = f.a < f.b ? f.a : f.b,
                p = f.a < f.b ? f.b : f.a;
            return `${m}:${p}`;
        };
        function mark_version(v, tag) {
            if (!states[v])
                states[v] = {};
            states[v][tag] = true;
        }
        function mark(fissure) {
            let fid = fis(fissure);
            Object.keys(fissure.nodes).forEach(v => mark_version(v, fid));
        };
        Object.values(self.fissures).forEach(mark);
        return v => states[v] || {};
    }
    return self
}
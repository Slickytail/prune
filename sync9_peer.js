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
    self.old_fissures = {}
    self.full_ack_leaves = {}
    self.phase_one = {}
    
    self.connect = pid => {
        self.peers[pid] = {a: sync9_guid()}
        p_funcs.get(pid, self.peers[pid].a)
    }
    
    self.disconnect = pid => {
        if (!self.peers[pid]) return
        if (self.peers[pid].b) {
            self.fissure(pid, {
                a: self.peers[pid].a,
                b: self.peers[pid].b,
                top: Object.assign({}, self.full_ack_leaves),
                bottom: Object.assign({}, self.s9.leaves)
            })
        }
        delete self.peers[pid]
    }
    
    function on_fissure(fissure, on_old, on_new, on_delete) {
        if (self.old_fissures[fissure.a + ':' + fissure.b]) {
            if (on_old) on_old()
            return
        }
        if (!self.fissures[fissure.a + ':' + fissure.b]) {
            self.fissures[fissure.a + ':' + fissure.b] = fissure
            if (on_new) on_new()
        }
        if (self.fissures[fissure.b + ':' + fissure.a]) {
            delete self.fissures[fissure.b + ':' + fissure.a]
            delete self.fissures[fissure.a + ':' + fissure.b]
            self.old_fissures[fissure.b + ':' + fissure.a] = true
            self.old_fissures[fissure.a + ':' + fissure.b] = true
            if (on_delete) on_delete()
        }
    }
    
    self.fissure = (pid, fissure) => {
        on_fissure(fissure, () => {
            p_funcs.fissure(pid, {
                a: fissure.b,
                b: fissure.a,
                top: {},
                bottom: {}
            })
        }, () => {
            Object.entries(self.peers).forEach(x => {
                if (x[0] != pid)
                    p_funcs.fissure(x[0], fissure)
            })
        }, () => {
            self.prune()
        })
    }
    
    self.get = (pid, id) => {
        self.peers[pid].b = id
        var vs = sync9_extract_versions(self.s9, x => x == 'root')
        var fs = self.fissures
        p_funcs.set_multi(pid, vs, fs)
    }
    
    self.set_multi = (pid, vs, fs) => {
        var new_vs = null
        vs.forEach(v => {
            if (!self.s9.T[v.vid]) {
                if (!new_vs) new_vs = []
                new_vs.push(v)
                sync9_add_version(self.s9, v.vid, v.parents, v.changes)
            }
        })
        var new_fs = null
        var return_fs = null
        Object.entries(fs).forEach(x => {
            on_fissure(x[1], () => {
                if (!return_fs) return_fs = {}
                var key = x[1].b + ':' + x[1].a
                return_fs[key] = {
                    a: x[1].b,
                    b: x[1].a,
                    top: x[1].top,
                    bottom: x[1].bottom
                }
            }, () => {
                if (!new_fs) new_fs = {}
                new_fs[x[0]] = x[1]
            })
        })
        if (new_vs || new_fs) {
            Object.keys(self.peers).forEach(p => {
                if (p != pid)
                    p_funcs.set_multi(p, new_vs || [], new_fs || {})
            })
        }
        if (return_fs) p_funcs.set_multi(pid, [], return_fs)
        
        self.prune()
    }
    
    function add_full_ack_leaf(vid) {
        var marks = {}
        function f(v) {
            if (!marks[v]) {
                marks[v] = true
                delete self.full_ack_leaves[v]
                Object.keys(self.s9.T[v]).forEach(f)
            }
        }
        f(vid)
        self.full_ack_leaves[vid] = true
    }
    
    self.local_set = (vid, parents, changes) => {
        sync9_add_version(self.s9, vid, parents, changes)
        var ps = Object.keys(self.peers)
        self.phase_one[vid] = {origin: null, count: ps.length}
        ps.forEach(p => {
            p_funcs.set(p, vid, parents, changes)
        })
        check_ack_count(vid)
    }
    
    self.set = (pid, vid, parents, changes) => {
        if (!self.s9.T[vid]) {
            
            // work here
            // var old_s9 = JSON.parse(JSON.stringify(self.s9))
            // try {
                sync9_add_version(self.s9, vid, parents, changes)
            
            // } catch (e){
            //     debugger
            //     sync9_add_version(old_s9, vid, parents, changes)
            // }
            
            
            var ps = Object.keys(self.peers)
            self.phase_one[vid] = {origin: pid, count: ps.length - 1}
            ps.forEach(p => {
                if (p != pid)
                    p_funcs.set(p, vid, parents, changes)
            })
        } else {
            self.phase_one[vid].count--
        }
        check_ack_count(vid)
    }
    
    self.ack = (pid, vid) => {
        self.phase_one[vid].count--
        check_ack_count(vid)
    }
    
    function check_ack_count(vid) {
        if (self.phase_one[vid].count == 0) {
            if (self.phase_one[vid].origin)
                p_funcs.ack(self.phase_one[vid].origin, vid)
            else {
                add_full_ack_leaf(vid)
                Object.keys(self.peers).forEach(p => {
                    p_funcs.full_ack(p, vid)
                })
            }
        }
    }
    
    self.full_ack = (pid, vid) => {
        if (!self.s9.T[vid])
            return
        var ancs = sync9_get_ancestors(self.s9, self.full_ack_leaves)
        if (!ancs[vid]) {
            add_full_ack_leaf(vid)
            Object.keys(self.peers).forEach(p => {
                if (p != pid)
                    p_funcs.full_ack(p, vid)
            })
            self.prune()
        }
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
            Object.keys(x[1].top).forEach(v => tag(v, x[0]))
            Object.keys(x[1].top).forEach(v => frozen[v] = true)
            function freeze(vid) {
                if (tags[vid].tags[x[0]]) return
                frozen[vid] = true
                Object.keys(self.s9.T[vid]).forEach(freeze)
            }
            Object.keys(x[1].bottom).forEach(freeze)
        })
        Object.keys(self.full_ack_leaves).forEach(v => tag(v, '_full_ack'))
        Object.keys(self.full_ack_leaves).forEach(v => frozen[v] = true)
        Object.entries(tags).forEach(x => {
            var keys = Object.keys(x[1].tags)
            if (keys.length == 0) {
                frozen[x[0]] = true
            } else if (!frozen[x[0]]) {
                x[1].tag = keys.sort().join(',')
            }
        })
        var q = (a, b) => !frozen[a] && !frozen[b] && (tags[a].tag == tags[b].tag)
        sync9_prune2(self.s9, q, q)
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
            Object.keys(x[1].top).forEach(v => tag(v, x[0]))
            Object.keys(x[1].top).forEach(v => frozen[v] = true)
            function freeze(vid) {
                if (tags[vid].tags[x[0]]) return
                frozen[vid] = true
                Object.keys(self.s9.T[vid]).forEach(freeze)
            }
            Object.keys(x[1].bottom).forEach(freeze)
        })
        Object.keys(self.full_ack_leaves).forEach(v => tag(v, '_full_ack'))
        Object.keys(self.full_ack_leaves).forEach(v => frozen[v] = true)
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
                acked: tags[a].tags['_full_ack'] || false,
                fissures: Object.keys(tags[a].tags).filter(x => x != '_full_ack')
            }
        }
    }    
    
    return self
}
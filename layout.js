var P = null;
const N = 6;
var elw;
var elh;
function begin() {
    // Compute the size of SVG elements
    const body = document.getElementsByTagName('body')[0];
    var computedStyle = getComputedStyle(body);

    const bh = body.clientHeight
        - parseFloat(computedStyle.paddingTop)
        - parseFloat(computedStyle.paddingBottom);
    const bw = body.clientWidth
        - parseFloat(computedStyle.paddingLeft)
        - parseFloat(computedStyle.paddingRight);
    
    const ratio = document.documentElement.clientWidth
                    / document.documentElement.clientHeight;
    elw = Math.min((ratio > 1) ? bw/2 : bw, 400),
    elh = Math.min((ratio > 1) ? bh : bh/2, 400);

    d3.select("svg.dag").attr("viewBox", `-40 -40 ${elw+80} ${elh+80}`);
    const svg = d3.select("svg.network")
                    .attr("viewBox", `-20 -20 ${elw+40} ${elh+40}`);
    const sim_scale = Math.min(1, Math.min(elw, elh)/400);
    
    var nodes = [];
    var links = [];
    var p_data = null;

    function bind_controls() {
        document.getElementById('edit_prob').oninput = () => {
            const exp = -2 * Math.log(N)/Math.log(0.25);
            EDIT_PROB = Math.pow(document.getElementById('edit_prob').value, exp);
            document.getElementById('edit_prob-text').innerText = EDIT_PROB.toFixed(3);
        };
        document.getElementById('edit_prob').oninput();

        document.getElementById('connect_prob').oninput = () => {
            CONNECT_PROB = document.getElementById('connect_prob').value;
            document.getElementById('connect_prob-text').innerText = Number(CONNECT_PROB).toFixed(3);
        };
        document.getElementById('connect_prob').oninput();

        document.getElementById('timing').oninput = () => {
            TIMING = 1000*Math.pow(10, -document.getElementById('timing').value);
            document.getElementById('timing-text').innerText = `1/${TIMING.toFixed(0)}`;
        };
        document.getElementById('timing').oninput();

        document.getElementById('latency').oninput = () => {
            LATENCY = Math.floor(Math.pow(document.getElementById('latency').value, 2));
            document.getElementById('latency-text').innerText = Number(LATENCY).toFixed(0);
        };
        document.getElementById('latency').oninput();

        document.getElementById('bandwidth').oninput = () => {
            BANDWIDTH = Math.floor(Math.pow(10, document.getElementById('bandwidth').value));
            document.getElementById('bandwidth-text').innerText = BANDWIDTH.toFixed(0);
        };
        document.getElementById('bandwidth').oninput();

        var paused = false;
        document.getElementById('play-pause').onclick = function() {
            paused = !paused;
            d3.select(this)
                .classed("fa-pause", !paused)
                .classed("fa-play", paused);
            trial.paused = paused;
        };
    };
    bind_controls();

    var trial = new Trial({
        peers: N});
    trial.on("topology", update_links);
    trial.on("edit", rec_edit);
    trial.begin();

    /* Recompute nodes and links when they get changed (ie, on the topology event) */
    function update_links(peers) {
        net_peers = peers;
        // Note the current number of links and nodes to see if they change.
        // The event should fire after a single change so we should never miss a change due to counting
        let nodes_old_len = nodes.length;
        let links_old_len = links.length;
        // Copy over the old nodes' locations so that we can update seamlessly
        let nodes_new = Object.keys(peers).map(uid => {
            let node = {id: uid}
            for (let peer of nodes) {
                if (peer.id === uid) {
                    node.x = peer.x;
                    node.y = peer.y;
                    break;
                }
            }
            if (!p_data) {
                P = peers[uid];
                node.selected = true;
                p_data = node;
            }
            return node;
        })
        // Done computing nodes

        links = [];
        // Let's traverse the graph
        // Keep track of what we've seen
        let seen_peers = new Set();
        // Recursively explore the graph
        function add_links(peer) {
            if (seen_peers.has(peer))
                return;
            seen_peers.add(peer);
            for (let link of Object.keys(peers[peer].peers)) {
                links.push({source: peer, target: link})
                add_links(link)
            }
        }
        // Pick the "first" peer and start traversing
        add_links(Object.keys(peers)[0]);
        // Done computing links

        // If the nodes or links changed, update them in the simulation
        // This might be unnecessary and it depends on the internals of the simulation
        if (nodes_new.length != nodes_old_len) {
            nodes = nodes_new;
            simulation.nodes(nodes);
        }
        if (links.length != links_old_len) {
            simulation.force("link").links(links);
        }
        // Update graphics handles creating and deleting SVG elements
        if (nodes.length != nodes_old_len || links.length != links_old_len) {
            update_graphics();
            simulation.alpha(0.2).restart();
        }
    }
    /* When we get an edit, mark "edit time" on the peer that made it */
    function rec_edit(uid, edit) {
        let c = d3
            .selectAll("svg.network .nodes > g")
            .filter(d => d.id == uid)
            .select("circle");
        if (c.classed("edit-blip-1")) {
            c.classed("edit-blip-1", false);
            c.classed("edit-blip-2", true);
        } else {
            c.classed("edit-blip-2", false);
            c.classed("edit-blip-1", true);
        }
    }
    /* Update the SVG elements with new or removed nodes and links */
    function update_graphics() {
        // Bind the nodes to the data
        node = node.data(nodes, d => d.id);
        // Remove deleted nodes
        node.exit().remove();
        // Add new nodes and draw circles on them

        let enter = node.enter()
            .append("g")
            .classed("node-group", true)
            .attr("data-pid", d => d.id);
        enter.append("circle")
            .classed("node", true)
            .attr("r", 10)
        enter.append("rect")
            .classed("node-label-background", true)
        enter.append("text")
            .classed("node-label", true)
            .attr("x", 13)
            .attr("y", -10)
            .text((d, i) => `Peer #${i+1}`);
        enter.select("rect")
            .each(function (d) {
                // hopefully this.nextSibling will always be the text.
                var box = this.nextSibling.getBBox();
                const pad_x = 7;
                const pad_y = 1;
                d3.select(this)
                    .attr("x", box.x - pad_x)
                    .attr("y", box.y - pad_y)
                    .attr("width", box.width + pad_x * 2)
                    .attr("height", box.height + pad_y * 2)
                    .attr("rx", pad_y + box.height/2);
            });
        enter.call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended))
            .on('mouseover', hoverOn);
        node = node.merge(enter)
            .classed("selected", d => d.selected);

        // Bind links, remove deleted, and add new.
        link = link.data(links, d => d.source.id + "-" + d.target.id);
        link.exit().remove();
        link = link.enter()
                    .append(() => {
                            let group = document.createElementNS("http://www.w3.org/2000/svg","g");
                            let back = document.createElementNS("http://www.w3.org/2000/svg","line");
                            let front = document.createElementNS("http://www.w3.org/2000/svg","line");
                            group.append(back, front);
                            return group;
                        })
                        .merge(link);
    }
    /* Update fissure notifications for peers */
    var colors = {};
    function fis(f) {
        let m = f.a < f.b ? f.a : f.b,
            p = f.a < f.b ? f.b : f.a;
        return {
            min: m,
            plus: p,
            sign: f.a < f.b ? "+" : "-",
            tag: `${m}:${p}`
        };
    };
    function update_fissures() {
        let fissures = new Set();
        for (let p of Object.values(trial.peers)) {
            Object.values(p.fissures)
                .forEach(f => fissures.add(fis(f).tag));
        }
        // Delete unused colors
        for (let f of Object.keys(colors)) {
            if (!fissures.has(f))
                delete colors[f];
        }
        for (let f of fissures) {
            if (!colors[f]) {
                // Let's find a new color
                // What we want to do is find the color that is furthest away from every other color
                let positions = Object.values(colors).map(c => c.angle).sort().concat([1]);
                let best = 0,
                    biggest = positions[0];
                for (let i = 0; i < positions.length - 1; i++) {
                    let smaller = positions[i];
                    let bigger = positions[i+1];
                    if (bigger - smaller > biggest) {
                        best = (bigger + smaller) / 2;
                        biggest = bigger - smaller;
                    }
                }

                colors[f] = {angle: best, color: d3.interpolateRainbow(best)};
            }
        }
        
        let fdots = node
            .selectAll("g.fissure")
            .data(d => Object.values(trial.peers[d.id].fissures).map(fis),
                    f => f.tag+f.sign);
        
        fdots.exit().remove();

        let e = fdots
            .enter()
            .append("g")
            .classed("fissure", true)
        
        e.append("circle")
            .classed("fissure-circ", true)
            .attr("r", 7)
            .attr("fill", f => colors[f.tag].color);
        e.append('text')
            .classed("fissure-sign", true)
            .html(f => f.sign == "-" ? "&minus;" : "+")
            .attr("y", 5);
        fdots = fdots.merge(e)
            .attr("transform", (f, i) => `translate(${i * 18 + 20}, 10)`);
    }

    function update_panels(clear_dag) {
        update_fissures();
        draw_dag(trial.peers[p_data.id], colors, p_data.index, clear_dag);
        draw_spacetree(trial.peers[p_data.id], p_data.index);
    }
    const simulation = d3.forceSimulation()
        .force("link", d3.forceLink(links)
                            .id(d => d.id)
                            .distance(200 * sim_scale))
        .force("repel", d3.forceManyBody()
                            .strength(-1500 * sim_scale)
                            .distanceMax(400 * sim_scale))
        .force("center", d3.forceCenter(elw/2, elh/2));
    
    var link = svg.append("g")
                    .classed("links", true)
                .selectAll("line"),

        node = svg.append("g")
                    .classed("nodes", true)
                .selectAll("g");

    update_links(trial.peers);
    update_panels();

    simulation.on("tick", () => {
        // Move the nodes and lines
        nodes.forEach(d => {
            d.x = Math.min(Math.max(15, d.x), elw-15);
            d.y = Math.min(Math.max(15, d.y), elh-15);
        })
        link
            .selectAll("line")
            .data(d => [d, d])
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
        node
            .attr("transform", d => `translate(${d.x}, ${d.y})`);

    });
    
    function dragstarted(d) {
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        hoverOn(d);
    }

    function dragged(d) {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }

    function dragended(d) {
        if (!d3.event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
    let force = true;
    trial.on("tick", p => {
        if (p_data.id == p.uid)
            requestAnimationFrame(() => {
                update_panels(force);
            });
    });
    function hoverOn(d) {
        let clear = d != p_data;
        force = false;
        if (p_data)
            p_data.selected = false;
        
        d.selected = true;
        P = trial.peers[d.id];
        
        d3.selectAll("svg.network .nodes > g")
            .classed("selected", d => d.selected);
        p_data = d;
        requestAnimationFrame(() => {
            update_panels(clear);
        });
    }
    
}

begin();
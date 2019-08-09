function layout(S9, svg) {
    const pad = 40;

    var min_y = Infinity;
    var max_y = -Infinity;

    var x = 0;
    var y_init = elh/2;

    var nodes = [];
    var links = [];

    var dummy = svg.select("g.dummy-text");
    function helper(node, prev_node, y, px, py, i) {
        max_y = Math.max(y, max_y);
        min_y = Math.min(y, min_y);

        var t = dummy
          .append("text")
            .text(node.elems)
            .classed("elems", true);
        var w = t.node()
          .getBBox()
          .width;
        var width = Math.max(w+1, 3);
        t.remove();
        
        // Where the connecting line comes in
        var connect_x = x;
        var text_x = x;
        
        if (node.gash) { // Gash means concave beginning
            connect_x += 8;
            text_x += 10;
        }
        else 
            connect_x -= 7;
            
        var end_x = text_x + width;
        if (!node.end_cap) // End cap means convex end
            end_x += 10;
        
        // Create the connecting line
        let v = node.vid ? node.vid : `${prev_node.vid}:${i}`
        if (prev_node) {
            links.push({
                from: prev_node.vid,
                to: v,
                x0: px, y0: py,
                x1: connect_x, y1: y
            });
        }
        nodes.push({
            vid: v,

            gash: node.gash, // Left side concave
            end_cap: node.end_cap, // Right side convex
            deleted: Boolean(Object.keys(node.deleted_by).length), // Draw red

            x: x,
            y: y - 20,
            w: end_x - x,
            h: 40,

            tx: text_x - x,
            ty: 20,
            text: node.elems,
        })
        
        var cx = node.end_cap ? end_x + 7 : end_x - 7;
        x = end_x + 25;
        for (let n of node.nexts) helper(n, node, y - 40, cx, y, 0);
        
        var orig = node.vid ? node : prev_node;
        if (node.next) helper(node.next, orig, y, cx, y, i+1);
    }
    var S = sync9_space_dag_get(S9.val.S, 0).S;
    helper(S, null, y_init, x, y_init, 0);
    svg.attr("viewBox", `${-pad} ${min_y - pad} ${x+pad*2} ${max_y + pad}`);
    return {nodes: nodes, links: links};
}
function draw_spacetree(peer) {
    const svg = d3.select("svg.spacetree");

    const {nodes, links} = layout(peer.s9, svg);

    let l = svg.select("g.links")
      .selectAll("line.line")
        .data(links, l => `${l.prev}-${l.next}`);

    l.enter()
      .append("line")
        .classed("line", true)
      .merge(l)
        .attr("x1", l => l.x0)
        .attr("y1", l => l.y0)
        .attr("x2", l => l.x1)
        .attr("y2", l => l.y1)
    
    l.exit().remove();

    // Nodes: Data
    let n = svg.select("g.nodes")
      .selectAll("g.ins")
        .data(nodes, l => l.vid)
    // Nodes: Enter
    let enter = n.enter()
      .append("g")
        .classed("ins", true)
        .attr("data-vid", l => l.vid)
   
    enter.append("path")
        .classed("ins-box", true);

    enter.append("text")
        .classed("ins-text", true);

    enter.append("line")
        .classed("strikethrough", true);

    enter.merge(n)
        .attr("transform", n => `translate(${n.x}, ${n.y})`)
        .classed("deleted", n => n.deleted);
    // Nodes: Exit
    n.exit().remove();
    // Nodes: Update
    const cr = 35;
    n.select("path.ins-box")
        .attr("d", n => 
            `M 0 0
             L ${n.w} 0
             A ${cr} ${cr} 0 0 ${n.end_cap ? 1 : 0} ${n.w} ${n.h}
             L 0 ${n.h}
             A ${cr} ${cr} 0 0 ${n.gash ? 0 : 1} 0 0
             Z`);

    n.select("text.ins-text")
        .attr("x", n => n.tx)
        .attr("y", n => n.ty + 6)
        .text(n => n.text);

    n.select("line.strikethrough")
        .attr("x1", n => n.tx)
        .attr("y1", n => n.ty)
        .attr("x2", n => n.end_cap ? n.w - 2 : n.w - 12)
        .attr("y2", n => n.ty)
}
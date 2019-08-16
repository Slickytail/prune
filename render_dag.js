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
var draw_n;
var s_fissure = null;
/* Draw the dag for a peer pe */
function draw_dag(pe, colors, force) {
    // Get the timedag of the peer
    let timedag = Object.entries(pe.s9.T)
        .map(([k, v]) => {
            return {id: k, parentIds: Object.keys(v)};
        });
    
    if (timedag.length > 500 && !force) {
        d3.select("svg.dag").classed("disabled", true);
        return false;
    }
    if (++draw_n * 50 < timedag.length && !force) {
        return false;
    }
    draw_n = 0;

    let x = pe.v_state();
    let z = pe.f_state();

    let dag = d3.dagStratify()(timedag);
    let layout = d3.sugiyama()
        .size([elw, elh])
        .layering(d3.layeringLongestPath())
        .decross(d3.decrossTwoLayer())
        .coord(d3.coordCenter());
    layout(dag);

    let svg = d3.select("svg.dag")
        .classed("disabled", false);
    
    const size_scale = 1/(1 + timedag.length/250);
    // How to draw edges
    let line = d3.line()
        .curve(d3.curveCatmullRom
            .alpha(0.8))
        .x(d => d.x)
        .y(d => d.y);

    let fissures = Object.values(pe.fissures).map(fis);
    function color_nodes() {
        svg
          .selectAll('circle.dag-version')
            .attr('stroke', ({id}) => z(id)[s_fissure] ? colors[s_fissure].color : null);
    }
    
    // Plot edges
    let edges = svg.select("g.edges")
        .attr('stroke-width', 3 * size_scale)
      .selectAll('path')
        .data(dag.links(), l => `${l.source.id}-${l.target.id}`);

    edges.enter()
      .append('path')
        .classed('dag-line', true)
      .merge(edges)
        .attr('d', ({ data }) => line(data.points));

    edges.exit().remove();
    
    let nodes = svg.select("g.nodes")
        .attr('stroke-width', 3 * size_scale)
      .selectAll('circle')
        .data(dag.descendants(), n => n.id);
    
    nodes.enter()
      .append('circle')
        .classed('dag-version', true)
        .attr('stroke', "#4e6069")
        .attr("data-vid", ({id}) => id)
      .merge(nodes)
        .attr('r', 10 * size_scale)
        .attr('cx', ({x, y}) => x)
        .attr('cy', ({x, y}) => y)
        .classed("frozen", ({id}) => x(id).frozen)
        .classed("acked", ({id}) => x(id).acked)
        .classed("fissured", ({id}) => Object.keys(z(id)).length);

    nodes.exit().remove();
    color_nodes();

    const arrowhead = d3.symbol().type(d3.symbolTriangle).size(60 * size_scale);
    let arrows = svg.select('g.arrows')
      .selectAll('path')
        .data(dag.links(), l => `${l.source.id}-${l.target.id}`);
    
    arrows.enter()
      .append('path')
        .classed('dag-arrow', true)
        .attr('d', arrowhead)
      .merge(arrows)
        .attr('transform', ({data}) => {
            // Last two points from the data
            let [end, start] = data.points.reverse();
            let dx = start.x - end.x;
            let dy = start.y - end.y;
            let scale = size_scale * 12 / Math.sqrt(dx * dx + dy * dy);
            // This is the angle of the last line segment
            let angle = Math.atan2(-dy, -dx) * 180 / Math.PI + 90;
            return `translate(${end.x + dx * scale}, ${end.y + dy * scale}) rotate(${angle})`;
        });
    
    arrows.exit().remove();
    
    let fissure_bars = d3.select('.fissures')
      .selectAll('div')
        .data(fissures, f => f.tag+f.sign);
    
    fissure_bars.enter()
      .append('div')
        .classed('dag-select', true)
        .classed('dag-plus', f => f.sign == "+")
        .classed('dag-minus', f => f.sign == "-")
        .style('background-color', f => colors[f.tag].color)
        .on('mouseover click', function (d) {
            s_fissure = d.tag;
            d3.selectAll('.dag-select')
                .classed("selected", false);
            d3.select(d3.event.target)
                .classed("selected", true);
            setTimeout(() => color_nodes());
        })
        .on('mouseout', d => {
            if (s_fissure === d.tag)
                s_fissure = null;
            d3.select(d3.event.target)
                .classed("selected", false);
            setTimeout(() => color_nodes());
        })
      .merge(fissure_bars);

    fissure_bars.exit().remove(); 

    d3.select("#dag-versions").text(dag.descendants().length);
    d3.select("#dag-edges").text(dag.links().length);
        
}
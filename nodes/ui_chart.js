module.exports = function(RED) {
    var ui = require('../ui')(RED);
    var ChartIdList = {};

    function ChartNode(config) {
        RED.nodes.createNode(this, config);
        this.chartType = config.chartType || "line";
        var node = this;
        var group = RED.nodes.getNode(config.group);
        if (!group) { return; }
        var tab = RED.nodes.getNode(group.config.tab);
        if (!tab) { return; }
        if (config.width === "0") { delete config.width; }
        if (config.height === "0") { delete config.height; }
        // number of pixels wide the chart will be... 43 = sizes.sx - sizes.px
        var pixelsWide = ((config.width || group.config.width || 6) - 1) * 43 - 15;
        if (!tab || !group) { return; }
        var options = {
            emitOnlyNewValues: false,
            node: node,
            tab: tab,
            group: group,
            control: {
                type: 'chart',
                look: node.chartType,
                order: config.order,
                label: config.label,
                legend: config.legend || false,
                interpolate: config.interpolate,
                nodata: config.nodata,
                width: parseInt(config.width || group.config.width || 6),
                height: parseInt(config.height || group.config.width/2+1 || 4),
                ymin: config.ymin,
                ymax: config.ymax,
                dot: config.dot || false,
                xformat : config.xformat || "HH:mm:SS",
                cutout: parseInt(config.cutout || 0),
                colors: config.colors
            },
            convertBack: function(data) {
                if (data[0] && data[0].hasOwnProperty("values")) { return [data[0].values]; }
            },
            convert: function(value, oldValue, msg) {
                var converted = {};
                if (ChartIdList.hasOwnProperty(node.id) && ChartIdList[node.id] !== node.chartType) {
                    value = [];
                    oldValue = [];
                }
                ChartIdList[node.id] = node.chartType;
                if (Array.isArray(value)) {
                    value = [{ key:node.id, values:(value[0] || {series:[], data:[], labels:[]}) }];
                    converted.update = false;
                    converted.updatedValues = value;
                }
                else {
                    value = parseFloat(value);                      // only handle numbers
                    if (isNaN(value)) { return oldValue || []; }    // return if not a number
                    var label = msg.topic || 'Label';
                    var series = msg.series || "";
                    if (node.chartType === "bar" || node.chartType === "horizontalBar") {
                        label = msg.series || "";
                        series = msg.topic || "";
                    }
                    var found = false;
                    if (!oldValue) { oldValue = [];}
                    if (oldValue.length === 0) {
                        oldValue = [{ key:node.id, values:{ series:[], data:[], labels:[] } }];
                    }
                    if (node.chartType === "line" || node.chartType === "bar" || node.chartType === "horizontalBar" || node.chartType === "radar") {  // Bar and Radar
                        var refill = false;
                        if (node.chartType === "line") { series = label; label = ""; }
                        var s = oldValue[0].values.series.indexOf(series);
                        var l = oldValue[0].values.labels.indexOf(label);
                        if (s === -1) {
                            oldValue[0].values.series.push(series);
                            s = oldValue[0].values.series.length - 1;
                            oldValue[0].values.data[s] = [];
                            if (l > 0) { refill = true; }
                        }
                        if (l === -1) {
                            oldValue[0].values.labels.push(label);
                            l = oldValue[0].values.labels.length - 1;
                            if (l > 0) { refill = true; }
                        }
                        if (node.chartType === "line") {
                            var timestamp = msg.timestamp;
                            var time;
                            if (timestamp !== undefined) { time = new Date(timestamp).getTime(); }
                            else { time = new Date().getTime(); }
                            var limitOffsetSec = parseInt(config.removeOlder) * parseInt(config.removeOlderUnit);
                            var limitTime = time - limitOffsetSec * 1000;
                            if (time < limitTime) { return oldValue; } // ignore if too old for window
                            var point = { "x":time, "y":value };
                            oldValue[0].values.data[s].push(point);
                            if (oldValue[0].values.data[s].length > config.removeOlderPoints) {
                                oldValue[0].values.data[s].shift();
                            }
                        }
                        else {
                            oldValue[0].values.data[s][l] = value;
                            if (refill) {
                                for (var i = 0; i < oldValue[0].values.series.length; i++) {
                                    for (var k = 0; k < oldValue[0].values.labels.length; k++) {
                                        oldValue[0].values.data[i][k] = oldValue[0].values.data[i][k] || null;
                                    }
                                }
                            }
                        }
                        converted.update = false;
                        converted.updatedValues = oldValue;
                    }
                    else { // Pie and Polar chart
                        for (var p=0; p<oldValue[0].values.labels.length; p++) {
                            if (oldValue[0].values.labels[p] === label) {
                                oldValue[0].values.data[p] = value;
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            oldValue[0].values.labels.push(label);
                            oldValue[0].values.data.push(value);
                        }
                        converted.update = false;
                        converted.updatedValues = oldValue;
                    }
                }
                return converted;
            }
        };

        ui.ev.on('changetab', function() {
            node.receive({payload:"A"});
        });

        var done = ui.add(options);
        setTimeout(function() {
            node.emit("input",{payload:"start"}); // trigger a redraw at start to flush out old data.
            if (node.wires.length === 2) { // if it's an old version of the node honour it
                node.send([null, {payload:"restore", for:node.id}]);
            }
        }, 100);
        node.on("close", function() {
            ui.ev.removeAllListeners();
            done();
        })
    }
    RED.nodes.registerType("ui_chart", ChartNode);
};

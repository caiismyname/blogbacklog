const { processFunc, setLogStatus } = require("../routes/process");
const { processFunc } = require("../routes/linkExtractor");
const testSites = require("./testSites.json");

setLogStatus(false);

console.log("Testing BlogBacklog extraction");

for (const site in testSites) {
    processFunc(site, (results) => {
        console.log(site);
        const solution = testSites[site];

        var missed = [];
        var overcapture = [];
        var correct = [];

        for (const link of solution) {
            if (results.includes(link)) {
                correct.push(link);
            } else {
                missed.push(link);
            }
        }

        for (const link of results) {
            if (!solution.includes(link)) {
                overcapture.push(link);
            }
        }

        if (missed.length > 0) {
            console.log("\tMissed " + missed.length);
            for (const link of missed) {
                console.log("\t\t" + link);
            }
        }

        if (overcapture.length > 0) {
            console.log("\tOvercaptured " + overcapture.length);
            for (const link of overcapture) {
                console.log("\t\t" + link);
            }
        }

        if (overcapture.length === 0 && missed.length === 0) {
            console.log("\tALL GOOD");
        }

        console.log("\n")
    })
}
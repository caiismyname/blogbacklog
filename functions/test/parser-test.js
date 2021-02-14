const { processFunc, setLogStatus } = require("../routes/linkExtractor");
const testSites = require("./testSites.json");

setLogStatus(false);

console.log("Testing BlogBacklog extraction");

Object.keys(testSites).forEach((site) => {
    processFunc(site, (results) => {
        console.log(site);
        const solution = testSites[site];

        const missed = [];
        const overcapture = [];
        const correct = [];

        solution.forEach((link) => {
            if (results.includes(link)) {
                correct.push(link);
            } else {
                missed.push(link);
            }
        });

        results.forEach((link) => {
            if (!solution.includes(link)) {
                overcapture.push(link);
            }
        });

        if (missed.length > 0) {
            console.log(`\tMissed ${missed.length}`);
            missed.forEach((link) => {
                console.log(`\t\t${link}`);
            });
        }

        if (overcapture.length > 0) {
            console.log(`\tOvercaptured ${overcapture.length}`);
            overcapture.forEach((link) => {
                console.log(`\t\t${link}`);
            });
        }

        if (overcapture.length === 0 && missed.length === 0) {
            console.log("\tALL GOOD");
        }

        console.log("\n");
    });
});

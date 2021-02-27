const domParser = require("html-dom-parser");
const request = require("request");

let logStatus = true;
const scoringWeights = require("./scoring-weights.json");

//
// Helpers and Cleaners
//

const parentTypes = {
    HEADER: "header",
    PARAGRAPH: "paragraph",
    UNKNOWN: "unknown",
    LI: "li",
};

function computeAverage(inputs) {
    return (inputs.reduce((sum, cur) => sum + cur) / inputs.length);
}

function extractBaseTitle(baseUrl) {
    const start = baseUrl.indexOf("://");
    if (start === -1) {
        return (baseUrl);
    }

    let cleaned = "";
    let cur = start + 3;
    while (baseUrl[cur] !== "/" && baseUrl[cur] !== "?" && cur < baseUrl.length) {
        cleaned += baseUrl[cur];
        cur += 1;
    }

    return (cleaned);
}

function cleanLinks(links, baseUrl) {
    // Replace strange characters
    let cleanedLinks = links.map((originalLink) => {
        const updatedLink = { ...originalLink };
        const toReplace = {
            " ": "",
            "&#x2F;": "/",
        };

        Object.keys(toReplace).forEach((key) => {
            updatedLink.url = updatedLink.url.replace(key, toReplace[key]);
        });

        return (updatedLink);
    });

    // Remove obviously incorrect links
    cleanedLinks = cleanedLinks.filter((linkData) => {
        // Remove non-links.
        // /comments, /about, and /account are for substack
        const banned = [".rss", ".xml", ".jpg", ".png", "mailto:", "facebook.com", "twitter.com", "linkedin.com", "github.com", "javascript:void(0)", "redirect=", "#more", "#comments", ".zip", "/comments", "/about", "/account", "/author/", "/user/", "/tag", "/page/", "/people/"]; // eslint-disable-line no-script-url

        // Remove self-links
        const variationsOfBaseUrl = [baseUrl, `${baseUrl}/`, "/"];

        return (!(
            banned.some((phrase) => linkData.url.includes(phrase))
            || variationsOfBaseUrl.some((variation) => linkData.url === variation)
        ));
        // Remove duplicates
        // if (!(cleanedLinks.includes(link))) {
        //     cleanedLinks.push(link);
        // }
    });

    return (cleanedLinks);
}

function sortObjectByValue(inputObject) {
    // Returns from least --> greatest
    const objs = [];
    Object.keys(inputObject).forEach((key) => {
        objs.push({
            key,
            value: inputObject[key],
        });
    });

    return (objs
        .sort((a, b) => (a.value - b.value))
        .map((x) => x.key)
    );
}

// Post-processing on cleaned links to ensure they are all full URLs
function formatLinks(links, baseUrl) {
    let newBaseUrl = baseUrl;
    if (newBaseUrl.slice(-1) !== "/") {
        newBaseUrl = newBaseUrl.concat("/");
    }

    let newLinks = links.slice();
    newLinks = newLinks.map((link) => {
        const updatedLink = { ...link };
        if (updatedLink.url.slice(0, 4) !== "http") {
            if (updatedLink.url.slice(0, 1) !== "/") {
                updatedLink.url = newBaseUrl + updatedLink.url;
            } else {
                updatedLink.url = newBaseUrl + updatedLink.url.slice(1);
            }
        }

        return (updatedLink);
    });

    return (newLinks);
}

// Merges two dicts
// function mergeDicts(a, b) {
//     const result = { ...a };
//     let fauxUUID = 0;

//     Object.keys(b).forEach((key) => {
//         if (key in result) {
//             const newKey = key + String(fauxUUID);
//             result[newKey] = b[key];
//             fauxUUID += 1;
//         } else {
//             result[key] = b[key];
//         }
//     });

//     return (result);
// }

function removeDuplicates(input) {
    return ([...new Set(input)]);
}

//
// Link finders
//

function findRoot(parsed) {
    const candidates = [];

    parsed.forEach((item) => {
        if ("children" in item) {
            candidates.push(item);
        }
    });

    return (candidates);
}

function detectBannedContent(attribs) {
    // Detect headers / sidebars
    const sections = ["class", "id", "role"];
    const extraneous = ["sidebar", "nav", "footer", "tag"];

    let containsBannedWords = false;
    let containsHeader = false;

    sections.forEach((section) => {
        if (section in attribs) {
            extraneous.forEach((item) => {
                if (attribs[section].toLowerCase().includes(item)) {
                    containsBannedWords = true;
                }
            });

            if (attribs[section].toLowerCase().includes("header")) {
                containsHeader = true;
            }
        }
    });

    return ({
        containsBannedWords,
        containsHeader,
    });
}

function traverser(node, depth, parentName, containsBannedWords, containsHeader) {
    let res = [];

    // First, check if current node is a link
    if (!node.attribs) {
        return (res);
    }

    if (node.name === "a" && node.attribs.href) {
        res.push({
            depth,
            attribs: node.attribs,
            url: node.attribs.href,
            scoring: {
                score: 0,
                depthFrequencyRanking: 0,
                containsBannedWords,
                containsHeader,
                parentName,
                similarToBaseUrl: false,
                frequency: 0,
            },
        });
    }

    if (logStatus) {
        // console.log("-----");
        // console.log(node.name);
        // console.log(node.type);
        // console.log(node.attribs);
        // console.log(node);
    }

    // Then, recursive call on children to check if they contain links

    let newParentName = parentName;
    const headerTags = ["h1", "h2", "h3", "h4", "h5", "h6"];
    if (newParentName === parentTypes.UNKNOWN || newParentName === parentTypes.LI) {
        if (headerTags.includes(node.name)) {
            newParentName = parentTypes.HEADER;
        } else if (node.name === "p") {
            newParentName = parentTypes.PARAGRAPH;
        } else if (node.name === "li") {
            newParentName = parentTypes.LI;
        }
    }

    let newContainsBannedWords = containsBannedWords;
    let newContainsHeader = containsHeader;

    const detection = detectBannedContent(node.attribs);
    newContainsBannedWords = detection.containsBannedWords || containsBannedWords;
    newContainsHeader = detection.containsHeader || containsHeader;

    node.children.forEach((child) => {
        const childrenResults = traverser(child, depth + 1, newParentName, newContainsBannedWords, newContainsHeader);

        // As a heuristic, most "title" elements where the link to a post is held will only have one link.
        // If multiple are discovered, it's like in the body of an excerpt of post itself.
        // var numLinksInDirectChildren = 0;
        // const directChildrenLinks = {};

        // if (numLinksInDirectChildren > 0) {
        //     childrenResults = mergeDicts(directChildrenLinks, childrenResults);
        // }

        res = res.concat(childrenResults);
    });

    return (res);
}

//
// Link Scorers
//

function scoreDepthSiblings(links) {
    const depthMap = {};

    // First pass over links to build depth-frequency-map
    Object.values(links).forEach((linkData) => {
        const depthCountValue = linkData.scoring.containsBannedWords ? 0.3 : 1; // Discount lesser links in the frequency map

        if (linkData.depth in depthMap) {
            depthMap[linkData.depth] += depthCountValue;
        } else {
            depthMap[linkData.depth] = depthCountValue;
        }
    });

    // Convert depthMap to relative ranking, ordered most to least frequent
    // TODO
    let depthsByFrequency = [];
    Object.keys(depthMap).forEach((depth) => {
        depthsByFrequency.push({
            key: depth,
            value: depthMap[depth],
        });
    });
    depthsByFrequency = depthsByFrequency.sort((a, b) => (a.value - b.value));
    depthsByFrequency = depthsByFrequency.map((x) => (parseInt(x.key, 10)));
    depthsByFrequency.reverse();

    // Object.values(newLinks).forEach((link) => {
    //     link.scoring.depthFrequencyRanking =
    //         depthsByFrequency.indexOf(link.depth) < 3
    //             ? 0
    //             : 1;
    // });

    // Add depthFrequencyRanking to each link.
    // Currently binning into two categories: top 3, or the rest
    const newLinks = links.map((originalLink) => {
        const updatedLink = { ...originalLink };
        updatedLink.scoring.depthFrequencyRanking
            = depthsByFrequency.indexOf(updatedLink.depth) < 3
                ? 0
                : 1;
        return (updatedLink);
    });

    return (newLinks);
}

function scoreBaseUrlSimilarity(links, baseUrl) {
    //
    // Testing actually removing the links from the list, instead of marking its params. List-type posts just won't work with the system.
    //

    const baseTitle = extractBaseTitle(baseUrl);

    const newLinks = links.filter((originalLinkData) => (
        originalLinkData.url.slice(0, 1) === "/"
            || originalLinkData.url.includes(baseTitle)
    ));
        // if (linkData.url.slice(0, 1) === "/") {
        //     // linkData.scoring.similarToBaseUrl = true;
        //     newLinks.push(linkData);
        // } else if (linkData.url.includes(baseTitle)) {
        //     // linkData.scoring.similarToBaseUrl = true;
        //     newLinks.push(linkData);
        // } else {
        //     // linkData.scoring.similarToBaseUrl = false;
        // }
    return (newLinks);
}

function scoreFrequency(links) {
    const linkCount = links
        .map((link) => (link.url))
        .reduce((counter, link) => {
            const updatedCounter = { ...counter };
            if (link in counter) {
                updatedCounter[link] += 1;
            } else {
                updatedCounter[link] = 1;
            }

            return (updatedCounter);
        }, {});

    const newLinks = links.map((originalLinkData) => {
        const updatedLinkData = { ...originalLinkData };
        updatedLinkData.scoring.frequency = linkCount[updatedLinkData.url] - 1;
        return (updatedLinkData);
    });

    return (newLinks);
}

function scoreLinkStructureSimilarity(links) {
    // Hypothesis: blog posts are the majority element, and they will all follow the same URL pattern
    // Boost links that have the same structure as the dominent structure.
    // For now, "structure" is just defined as: number of parts (slash (/) delimited)

    // Determine structure of each link, and frequency of each structure
    const structureCounts = {};
    const linkStructures = {};
    links
        .map((link) => link.url)
        .forEach((link) => {
            const structure = link.split("/").length - 1;
            linkStructures[link] = structure;

            if (structure in structureCounts) {
                structureCounts[structure] += 1;
            } else {
                structureCounts[structure] = 1;
            }
        });

    const sortedStructures = sortObjectByValue(structureCounts);
    const mostCommonStructure = parseInt(sortedStructures.slice(-1)[0], 10); // last element in the ascending-ly sorted list

    const newLinks = links.map((originalLinkData) => {
        // console.log(linkStructures[originalLinkData.url], linkStructures[originalLinkData.url] === mostCommonStructure);
        const updatedLinkData = { ...originalLinkData };
        updatedLinkData.scoring.structureSimilarity = linkStructures[updatedLinkData.url] === mostCommonStructure;
        return (updatedLinkData);
    });

    return (newLinks);
}

function scoreLinks(links, baseUrl) {
    let scoredLinks = [...links];

    // Run scoring functions.
    // Lower is better.
    scoredLinks = scoreDepthSiblings(scoredLinks);
    scoredLinks = scoreBaseUrlSimilarity(scoredLinks, baseUrl);
    scoredLinks = scoreFrequency(scoredLinks);
    scoredLinks = scoreLinkStructureSimilarity(scoredLinks);

    // Compute total score
    scoredLinks = scoredLinks.map((linkData) => {
        let score = 0;
        score += scoringWeights.depthFrequencyRanking * linkData.scoring.depthFrequencyRanking;
        score += scoringWeights.containsBannedWords * (linkData.scoring.containsBannedWords ? 5 : 0);
        score += scoringWeights.similarToBaseUrl * (linkData.scoring.similarToBaseUrl ? 0 : 1);
        score += scoringWeights.parentName * (linkData.scoring.parentName === parentTypes.PARAGRAPH ? 1 : 0);
        score -= scoringWeights.parentName * (linkData.scoring.parentName === parentTypes.HEADER ? 1 : 0);
        score -= scoringWeights.parentName * (linkData.scoring.parentName === parentTypes.LI ? 1 : 0);
        score -= scoringWeights.frequency * (linkData.scoring.frequency);
        score -= scoringWeights.structureSimilarity * (linkData.scoring.structureSimilarity ? 1 : 0);
        if (linkData.scoring.parentName !== parentTypes.HEADER) {
            score += scoringWeights.containsHeader * (linkData.scoring.containsHeader ? 1 : 0);
        }

        const updatedLinkData = { ...linkData };
        updatedLinkData.scoring.score = score;
        return (updatedLinkData);
    });

    return (scoredLinks);
}

function pickLinks(links) {
    if (links.length === 0) {
        return (links);
    }

    let chosenLinks = [];
    const scoreDistribution = links
        .map((link) => (link.scoring.score));

    // var lowestScore = scoreDistribution.reduce((acc, score) => {
    //     return (score < acc)  ? score : acc;
    // }, 100);

    const scoreThreshold = Math.max(0, computeAverage(scoreDistribution));

    if (logStatus) {
        console.log("Score Distribution", scoreDistribution);
        console.log("Score Threshold", scoreThreshold);
    }

    // chosenLinks = links;
    chosenLinks = links.filter((link) => (link.scoring.score <= scoreThreshold));

    return (chosenLinks);
}

function setLogStatus(status) {
    logStatus = status;
}

// `parseWebpage` is the entrypoint to this whole process
async function parseWebpage(url, callback) {
    const options = {
        url,
        headers: {
            "User-Agent": "request",
        },
    };
    request(options, (err, res, body) => {
        if (err) {
            console.log(err);
            callback([]);
            return;
        }

        const nodes = findRoot(domParser(body));
        let foundLinks = []; // dict of [link: weight]

        nodes.forEach((node) => {
            foundLinks = foundLinks.concat(traverser(node, 0, parentTypes.UNKNOWN, false, false));
        });

        const cleanedLinks = cleanLinks(foundLinks, url); // TODO converting dict to list needs to be moved out of this step
        const scoredLinks = scoreLinks(cleanedLinks, url);
        if (logStatus) { console.log("scored", scoredLinks); }
        const chosenLinks = pickLinks(scoredLinks);
        const formattedLinks = formatLinks(chosenLinks, url);

        const extractedLinks = removeDuplicates(formattedLinks.map((link) => (link.url)));

        if (logStatus) { console.log("Extracted Links:", extractedLinks); }

        callback(extractedLinks);
    });
}

exports.processFunc = (url, callback) => { parseWebpage(url, callback); };
exports.extractBaseTitle = (baseUrl) => (extractBaseTitle(baseUrl));
exports.setLogStatus = (status) => { setLogStatus(status); };

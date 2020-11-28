const { DateTime } = require('luxon');
const domParser = require('html-dom-parser');
const request = require('request'); 
var logStatus = true;
const scoringWeights = require('./scoring-weights.json');

//
// Helpers and Cleaners
//

const { default: parse } = require("node-html-parser");

const parentTypes = {
    HEADER: 'header',
    PARAGRAPH: 'paragraph',
    UNKNOWN: 'unknown',
    LI: 'li',
};

function cleanDayOfWeek(dayString) {
    return(DateTime.fromFormat(dayString, "EEEE").weekday);
}

function extractBaseTitle(baseUrl) {
    const start = baseUrl.indexOf("://");
    if (start === -1) {
        return(baseUrl);
    }

    var cleaned = "";
    var cur = start + 3;
    while (baseUrl[cur] !== "/" && baseUrl[cur] !== "?" && cur < baseUrl.length) {
        cleaned += baseUrl[cur];
        cur += 1;
    }

    return(cleaned);
}

function cleanLinks(links, baseUrl) {
    var cleanedLinks = [];

    for (const idx in links) {
        var link = links[idx];

        // Replace any strange characters
        const toReplace = {
            " ": "",
            "&#x2F;": "/",
        };

        for (const key in toReplace) {
            link.url = link.url.replace(key, toReplace[key]);
        }

        // Check for non-links
        var broke = false;
        const banned = [".rss", ".xml", ".jpg", ".png", "mailto:", "?share=facebook", "?share=google", "?share=twitter", "?share=reddit", "?share=linkedin", "javascript:void(0)", "redirect=", "#more", "#comments"];
        for (item of banned) {
            if (link.url.includes(item)) {
                broke = true;
                break;
            }
        }

        // Remove self-links
        const variationsOfBaseUrl = [baseUrl, baseUrl + "/", "/"];
        for (item of variationsOfBaseUrl) {
            if (link.url === item) {
                broke = true;
                break;
            }
        }

        if (broke) {
            continue;
        }
        
        // Remove duplicates
        // if (!(cleanedLinks.includes(link))) {
        //     cleanedLinks.push(link);
        // }

        cleanedLinks.push(link);
    }

    return(cleanedLinks);
}

// Post-processing on cleaned links to ensure they are all full URLs
function formatLinks(links, baseUrl) {
    var newBaseUrl = baseUrl;
    if (newBaseUrl.slice(-1) !== "/") {
        newBaseUrl = newBaseUrl.concat("/");
    }

    var newLinks = links.map((link) => {
        if (link.url.slice(0,4) !== "http") {
            if (link.url.slice(0,1) !== "/") {
                link.url = newBaseUrl + link.url;
            } else {
                link.url = newBaseUrl + link.url.slice(1);
            }
        }

        return (link);
    });

    return (newLinks);
}

// Merges two dicts
function mergeDicts(a,b) {
    const result = { ...a};
    var fauxUUID = 0;
    
    for (key in b) {
        if (key in result) {
            const newKey = key + String(fauxUUID);
            result[newKey] = b[key];
            fauxUUID += 1;
        } else {
            result[key] = b[key];
        }
    }

    return(result);
}

function removeDuplicates(input) {
    return ([...new Set(input)]);
}

//
// Link finders
//

function findRoot(parsed) {
    var candidates = [];

    for (item of parsed) {
        if ('children' in item) {
            candidates.push(item);
        }
    }

    return(candidates);
}

function detectBannedContent(attribs) {
    // Detect headers / sidebars
    const sections = ['class', 'id', 'role'];
    const extraneous = ['sidebar', 'nav', 'footer', 'tag'];

    var containsBannedWords = false;
    var containsHeader = false;

    for (const section of sections) {
        if (section in attribs) {
            for (item of extraneous) {
                if (attribs[section].toLowerCase().includes(item)) {
                    containsBannedWords = true;
                }
            }

            if (attribs[section].toLowerCase().includes('header')) {
                containsHeader = true;
            }
        }
    }

    return ({
        'containsBannedWords': containsBannedWords,
        'containsHeader': containsHeader,
    });
}

function traverser(node, depth, parentName, containsBannedWords, containsHeader) {
    var res = [];

    // First, check if current node is a link
    if (!node.attribs) {
        return(res);
    }

    if (node.name === 'a' && node.attribs.href) {
            res.push({
                'depth': depth,
                'attribs': node.attribs,
                'url': node.attribs.href,
                'scoring': {
                    'score': 0,
                    'depthFrequencyRanking': 0,
                    'containsBannedWords': containsBannedWords,
                    'containsHeader': containsHeader,
                    'parentName': parentName,
                    'similarToBaseUrl': false,
                    'frequency': 0,
                }
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

    var newParentName = parentName;
    const headerTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    if (newParentName === parentTypes.UNKNOWN || newParentName === parentTypes.LI) {
        if (headerTags.includes(node.name)) {
            newParentName = parentTypes.HEADER;
        } else if (node.name === 'p') {
            newParentName = parentTypes.PARAGRAPH;
        } else if (node.name === 'li') {
            newParentName = parentTypes.LI;
        }
    }
    
    var newContainsBannedWords = containsBannedWords;
    var newContainsHeader = containsHeader;

    const detection = detectBannedContent(node.attribs);
    newContainsBannedWords = detection.containsBannedWords || containsBannedWords;
    newContainsHeader = detection.containsHeader || containsHeader;

    for (childIdx in node.children) {
        const child = node.children[childIdx];

        var childrenResults = traverser(child, depth + 1, newParentName, newContainsBannedWords, newContainsHeader);

                 // As a heuristic, most "title" elements where the link to a post is held will only have one link.
        // If multiple are discovered, it's like in the body of an excerpt of post itself.
        // var numLinksInDirectChildren = 0;
        // const directChildrenLinks = {};

        // if (numLinksInDirectChildren > 0) {
        //     childrenResults = mergeDicts(directChildrenLinks, childrenResults);
        // }

        res = res.concat(childrenResults);
    }

    return(res);
}

// `parseWebpage` is the entrypoint to this whole process
async function parseWebpage(url, callback) {
    const options = {
        'url' : url,
        headers: {
            'User-Agent': 'request'
        }
    };
    request(options, (err, res, body) => {
        const nodes = findRoot(domParser(body));
        var foundLinks = []; // dict of [link: weight]

        for (node of nodes) {
            foundLinks = foundLinks.concat(traverser(node, 0, parentTypes.UNKNOWN, false, false));
        }
        
        // if (logStatus) { console.log(foundLinks); }
        
        const cleanedLinks = cleanLinks(foundLinks, url); // TODO converting dict to list needs to be moved out of this step
        const scoredLinks = score(cleanedLinks, url);
        if (logStatus) { console.log("scored", scoredLinks); };
        const chosenLinks = pickLinks(scoredLinks);
        const formattedLinks = formatLinks(chosenLinks, url);

        const extractedLinks = removeDuplicates(formattedLinks.map((link) => {return(link.url)}));
        
        if (logStatus) { console.log("Extracted Links:", extractedLinks); };

        callback(extractedLinks);
    });
}

//
// Link Scorers
//

function scoreDepthSiblings(links) {
    var depthMap = {};
    var newLinks = [ ... links];

    // First pass to build depthMap
    for (const link in newLinks) {
        const linkData = newLinks[link];

        var value = 0;

        if (linkData.scoring.containsBannedWords) {
            value = .3;
        } else {
            value = 1;
        }

        if (linkData.depth in depthMap) {
            depthMap[linkData.depth] = depthMap[linkData.depth] + value;
        } else {
            depthMap[linkData.depth] = value;
        }
    }

    // Convert depthMap to relative ranking, ordered most to least frequent
    var depthsByFrequency = [];
    for (const depth in depthMap) {
        depthsByFrequency.push({
            'key': depth,
            'value': depthMap[depth]
        });
    }
    depthsByFrequency = depthsByFrequency.sort((a,b) => {return(a['value'] - b['value'])});
    depthsByFrequency = depthsByFrequency.map((x) => {return(parseInt(x['key']))});
    depthsByFrequency.reverse();

    // Add depthFrequencyRanking to each link
    for (const link in newLinks) {
        var score = depthsByFrequency.indexOf(newLinks[link]['depth']);
        if (score > 1) {
            score = 1
        }
        newLinks[link].scoring.depthFrequencyRanking = score;
    }

    return (newLinks);
}

function scoreBaseUrlSimilarity(links, baseUrl) {
    var newLinks = [ ... links];
    const baseTitle = extractBaseTitle(baseUrl);

    for (const link in newLinks) {
        const linkData = newLinks[link];
        
        if (linkData.url.slice(0,1) === "/") {
            linkData.scoring.similarToBaseUrl = true;
        } else if (linkData.url.includes(baseTitle)) {
            linkData.scoring.similarToBaseUrl = true;
        } else {
            linkData.scoring.similarToBaseUrl = false;
        }
    }

    return (newLinks);
}

function scoreFrequency(links) {
    var newLinks = [ ... links];

    const linkCount = newLinks
        .map((link) => {return(link.url)})
        .reduce((counter, link) => {
            if (link in counter) {
                counter[link] = counter[link] + 1;
            } else {
                counter[link] = 1;
            }

            return (counter);
        }, {});

    for (link in newLinks) {
        const linkData = newLinks[link];
        linkData.scoring.frequency = linkCount[linkData.url] - 1;
    }

    return (newLinks);
}

function score(links, baseUrl) {
    // Lower is better
    var scoredLinks = [ ... links];

    // Run scoring functions
    scoredLinks = scoreDepthSiblings(scoredLinks);
    scoredLinks = scoreBaseUrlSimilarity(scoredLinks, baseUrl);
    scoredLinks = scoreFrequency(scoredLinks);

    // Compute total score
    for (const link in scoredLinks) {
        const linkData = scoredLinks[link];

        var score = 0;
        score += scoringWeights.depthFrequencyRanking * linkData.scoring.depthFrequencyRanking;
        score += scoringWeights.containsBannedWords * (linkData.scoring.containsBannedWords ? 5 : 0);
        score += scoringWeights.similarToBaseUrl * (linkData.scoring.similarToBaseUrl ? 0 : 1);
        score += scoringWeights.parentName * (linkData.scoring.parentName === parentTypes.PARAGRAPH ? 1 : 0);
        score -= scoringWeights.parentName * (linkData.scoring.parentName === parentTypes.HEADER ? 1 : 0);
        score -= scoringWeights.parentName * (linkData.scoring.parentName === parentTypes.LI ? .5 : 0);
        score -= scoringWeights.frequency * (linkData.scoring.frequency);
        if (linkData.scoring.parentName !== parentTypes.HEADER) {
            score += scoringWeights.containsHeader * (linkData.scoring.containsHeader ? 1 : 0);
        }

        linkData.scoring.score = score;
    }

    return (scoredLinks);
}

function pickLinks(links) {
    var chosenLinks = [];
    var scoreDistribution = links
        .map((link) => {return(link.scoring.score);});


    var lowestScore = scoreDistribution.reduce((acc, score) => {
        return (score < acc)  ? score : acc;
    }, 100);

    var scoreThreshold = Math.max(0, lowestScore);

    if (logStatus) {
        console.log("Score Distribution", scoreDistribution);
        console.log("Score Threshold", scoreThreshold);
    }

    chosenLinks = links.filter((link) => {return(link.scoring.score <= scoreThreshold)});
    
    return (chosenLinks);
}


exports.processFunc = (url, callback) => {parseWebpage(url, callback)};
exports.extractBaseTitle = (baseUrl) => {return(extractBaseTitle(baseUrl))};
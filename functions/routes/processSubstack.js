const request = require("request");

async function isSubstack(url, callback) {
    const options = {
        url,
        method: "HEAD", // Only request headers, skip the body
        headers: { "User-Agent": "request" },
    };

    request(options, (err, res) => {
        if (err) {
            console.error(err);
            callback([]);
            return;
        }

        const { headers } = res;
        callback(headers["x-served-by"] === "Substack");
    });
}

// This functions assumes the given URL is for a substack publication.
// The return value is to be used as the value for `pubName` in `getSubstackLinks`
// Does NOT include trailing `/`
function getSubstackPubName(url) {
    const start = url.indexOf("://") + 3;
    let end = url.indexOf("/", start);
    if (end === -1) {
        end = url.length;
    }
    return url.slice(0, end);
}

async function getArticles(pubName, sort, offset, limit, callback) {
    // Increament the `offset` until no more articles
    // As of 3/14/21, Substack limited requests to 12 articles
    const url = `${pubName}/api/v1/archive?sort=${sort}&offset=${offset}&limit=${limit}`;

    const options = {
        url,
        headers: { "User-Agent": "request" },
    };

    request(options, (err, res, body) => {
        if (err) {
            console.error(err);
            callback([]);
            return;
        }

        // Strip out extranenous returned fields
        const links = JSON.parse(body).map(
            (entry) => ({ 
                title: entry.title,
                url: entry.canonical_url
            })
        );

        // End recursion if no more articles
        if (links.length === 0) {
            callback(links);
        } else {
            getArticles(
                pubName,
                sort,
                offset + limit,
                limit,
                (moreLinks) => callback(links.concat(moreLinks)),
            );
        }
    });
}

async function getSubstackLinks(pubName, callback) {
    const offset = 0;
    const limit = 12;
    const sort = "new";

    getArticles(
        pubName,
        sort,
        offset, limit,
        (returnedLinks) => callback(returnedLinks),
    );
}

exports.getSubstackLinks = (pubName, callback) => { getSubstackLinks(pubName, callback); };
exports.isSubstack = (url, callback) => { isSubstack(url, callback); };
exports.getSubstackPubName = (url) => { getSubstackPubName(url); };

# Blog Backlog

Blog Backlog (BBL) is a tool that extracts semantically valuable (e.g. non-navigational) links from a webpage and send thems to a specified email address on a schedule.

The intended use case is to enabled metered consumption of a backlog of written content.

I made this because I often encounter blogs with a great history, but would be overwhelming to add to my read-it-later as a massive batch. This allows me to consume the posts on my own schedule without overloading my reading list.

## Tech Stack

The app is made using:
* JS as its only language, both FE and BE
* Pug as the FE templating engine
* Mailgun for email sending
* Firebase as the datastore
* Custom code for parsing webpages and determining what is actually a semantic link

## Semantic Link?

BBL is intended to scrape an index page of a blog (e.g. "All posts", "Archive", etc.) — other pages work, but these pages work best. Its heuristics are based on link structure, the DOM stack of the element that contains the link, contents of the link, and frequency patterns within the page. It's not perfect, but when it fails it tends to overcapture rather than under capture. And anyways, that's what the checkboxes and the text-entry box are for.

## Feature Todo List

* Automated handling of paged blogs (but Substack works!)
* Mimicking "scroll to the bottom" on pages that dynamically load content in batches, such as Substack's "all posts" page
* Better removal of sidebar / header elements
* Continual improvement of the parsing heuristic
* Tons of coding style issues to improve

_BBL is in active development. This README was last updated on 1.31.21_

/* global FeedItem */

'use strict';

function FeedService(webexService) {
  this._initServices(webexService);
}

FeedService.prototype._initServices = function(webexService) {
  this.webex = webexService;
};

FeedService.prototype.detectFeeds = async function() {
  const feeds = await this.webex.discoverFeeds();
  this.webex.createPanel('discover.html', feeds);
};

FeedService.prototype.getFeed = async function (url) {
  return (new this._FeedParser()).parse(await this._requestFeed(url));
};

FeedService.prototype._requestFeed = async function(url) {
  const response = await fetch(url, { method: 'GET', mode: 'cors' });
  if (response.status !== 200) {
    throw `Bad response from ${url}`;
  }
  return this._parseResponseXml(await response.text());
};

FeedService.prototype._parseResponseXml = function(text) {
  return (new window.DOMParser()).parseFromString(text, 'text/xml');
};

FeedService.prototype._FeedParser = function() {};
const _FeedParser = FeedService.prototype._FeedParser;

_FeedParser.prototype.parse = function(xml) {
  if (this._rssDetected(xml)) {
    return this._parseRss(xml);
  }

  if (this._atomDetected(xml)) {
    return this._parseAtom(xml);
  }

  if (this._rdfDetected(xml)) {
    return this._parseRdf(xml);
  }
};

_FeedParser.prototype._rssDetected = function(xml) {
  return xml.getElementsByTagName('rss').length > 0;
};

_FeedParser.prototype._parseRss = function(xml) {
  const feeds = [];
  for (const item of xml.getElementsByTagName('item')) {
    const title = this._readNodeValue(item, 'title');
    const link = this._readNodeValue(item, 'link');
    const description = this._readNodeValue(item, 'description');
    feeds.push(new FeedItem(title, link, description));
  }
  return feeds;
};

_FeedParser.prototype._atomDetected = function(xml) {
  return xml.getElementsByTagName('feed').length > 0;
};

_FeedParser.prototype._parseAtom = function(xml) {
  const feeds = [];
  for (const item of xml.getElementsByTagName('entry')) {
    const title = this._readNodeValue(item, 'title');
    const link = item.getElementsByTagName('link')[0].getAttribute('href');
    const description = this._readNodeValue(item, 'summary');
    feeds.push(new FeedItem(title, link, description));
  }
  return feeds;
};

_FeedParser.prototype._rdfDetected = function(xml) {
  return xml.getElementsByTagName('rdf:RDF').length > 0;
};

_FeedParser.prototype._parseRdf = function(xml) {
  const feeds = [];
  for (const item of xml.getElementsByTagName('rdf:li')) {
    const link = item.getAttribute('rdf:resource');
    feeds.push(new FeedItem(link, link));
  }
  return feeds;
};

_FeedParser.prototype._readNodeValue = function(node, tag) {
  try {
    return node.getElementsByTagName(tag)[0].childNodes[0].nodeValue;
  } catch(error) {
    return '';
  }
};
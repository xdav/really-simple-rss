/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global Util */

'use strict';

window.onload = onWindowLoaded;

function onWindowLoaded() {
  init();
}

function init() {
  initSidebar();
  initControls();
  initListeners();
}

function initSidebar() {
  browser.bookmarks.search('Simple Feeds').then(onFeedsFolderFound);
}

function onFeedsFolderFound(bookmarks) {
  browser.bookmarks.getSubTree(bookmarks[0].id).then(onBookmarksSubTreeParsed);
}

function onBookmarksSubTreeParsed(bookmarkItems) {
  let bookmarks = bookmarkItems[0].children;
  let feedsList = document.getElementById('feeds-list');
  Util.populateList(feedsList, bookmarks, onCreateBookmarkListNode);
}

function initControls() {
  document.getElementById('discover-button').onclick =
      () => onControlButtonClicked(onSendDiscoverMessage);
  document.getElementById('bookmark-button').onclick =
      () => onControlButtonClicked(onDisplayBookmarkPrompt);
}

function onControlButtonClicked(onGetActiveTab) {
  browser.windows.getCurrent({}).then(
    (currentWindow) => onGetCurrentWindow(currentWindow, onGetActiveTab)
  );
}

function onGetCurrentWindow(window, onGetActiveTab) {
  browser.tabs.query({active: true, windowId: window.id}).then(onGetActiveTab);
}

function onSendDiscoverMessage(tabs) {
  browser.tabs.sendMessage(tabs[0].id, {action: 'discover'})
    .then(onDiscoveredFeedsReceived);
}

function onDiscoveredFeedsReceived(feeds) {
  browser.storage.local.clear().then(() => onLocalStorageCleared(feeds));
}

function onLocalStorageCleared(feeds) {
  browser.storage.local.set({feeds: feeds}).then(onDiscoveredFeedsSaved);
}

function onDiscoveredFeedsSaved() {
  browser.windows.create({
    url: browser.extension.getURL('dialog/discover.html'),
    type: 'panel',
    width: 500,
    height: 200
  });
}

function onDisplayBookmarkPrompt(tabs) {
  if (window.confirm('Bookmark ' + tabs[0].url + '?')) {
    browser.bookmarks.search('Simple Feeds').then(
      (bookmarks) => onBookmarkCurrentPage(
        bookmarks[0].id, tabs[0].url, tabs[0].title));
  }
}

function onBookmarkCurrentPage(parentId, url, title) {
  const newBookmark = {
    index: 0,
    parentId: parentId,
    title: title,
    url: url
  };
  browser.bookmarks.create(newBookmark).then(() => initSidebar());
}

function initListeners() {
  browser.runtime.onMessage.addListener(onMessageReceived);
}

function onMessageReceived(message) {
  if (message.action === 'refresh') {
    initSidebar();
  }
}

function onCreateBookmarkListNode(bookmark) {
  let listNode = document.createElement('li');
  listNode.appendChild(createListNodeTextSection(bookmark));
  listNode.appendChild(createListNodeControlSection(bookmark));
  return listNode;
}

function createListNodeTextSection(bookmark) {
  let titleContainer = document.createElement('div');
  titleContainer.classList.add('feed-title-container');
  titleContainer.appendChild(
    document.createTextNode(bookmark.title ? bookmark.title : bookmark.url));
  titleContainer.onclick = () => onFeedSelected(bookmark.url, titleContainer);
  return titleContainer;
}

function createListNodeControlSection(bookmark) {
  let controlContainer = document.createElement('div');
  controlContainer.classList.add('feed-control-container');
  let deleteButton = document.createElement('input');
  deleteButton.type = 'image';
  deleteButton.src = '/icons/delete.svg';
  deleteButton.style.height = '15px';
  deleteButton.dataset.bookmarkId = bookmark.id;
  deleteButton.onclick = onDeleteButtonClicked;
  controlContainer.appendChild(deleteButton);
  return controlContainer;
}

function onDeleteButtonClicked() {
  if (confirm('Delete bookmark?')) {
    browser.bookmarks.remove(this.dataset.bookmarkId).then(initSidebar);
  }
}

function onFeedSelected(url, feedTitleContainer) {
  toggleClassOnElement(feedTitleContainer, 'selected-feed');
  let feedItems = document.getElementById('feed-items');
  Util.clearNodeContent(feedItems);
  feedItems.appendChild(document.createTextNode('Loading...'));
  let requestData = {method: 'GET', mode: 'cors'};
  fetch(url, requestData)
    .then(response => response.text())
    .then(responseText => parseXmlFromResponseText(responseText))
    .then(onXmlResponseDataParsed);
}

function toggleClassOnElement(elementToUpdate, className) {
  let otherElements = document.getElementsByClassName(className);
  for (let element of otherElements) {
    element.classList.remove(className);
  }
  elementToUpdate.parentNode.classList.add(className);
}

function parseXmlFromResponseText(responseText) {
  return (new window.DOMParser()).parseFromString(responseText, 'text/xml');
}

function onXmlResponseDataParsed(xmlData) {
  let parserFunction = selectFeedParser(xmlData);
  let fragment = document.createDocumentFragment();
  let feedItems = document.getElementById('feed-items');
  for (let listNode of parserFunction(xmlData)) {
    fragment.appendChild(listNode);
  }

  Util.clearNodeContent(feedItems);
  let panelContent = fragment.hasChildNodes() ?
    fragment : document.createTextNode('[No items in feed]');
  feedItems.append(panelContent);
}

function selectFeedParser(xmlData) {
  if (xmlData.getElementsByTagName('rss').length > 0) {
    return parseRss;
  }

  if (xmlData.getElementsByTagName('feed').length > 0) {
    return parseAtom;
  }

  if (xmlData.getElementsByTagName('rdf:RDF').length > 0) {
    return parseRdf;
  }
}

function* parseRss(xmlData) {
  let channel = xmlData.getElementsByTagName('channel')[0];
  for (let item of channel.getElementsByTagName('item')) {
    let title = item.getElementsByTagName('title')[0].childNodes[0].nodeValue;
    let link = item.getElementsByTagName('link')[0].childNodes[0].nodeValue;
    let summary = item.getElementsByTagName('description')[0]
      .childNodes[0].nodeValue;
    let listNode = document.createElement('li');
    listNode.appendChild(createAnchor(link, title, summary));
    yield listNode;
  }
}

function* parseAtom(xmlData) {
  let feed = xmlData.getElementsByTagName('feed')[0];
  for (let entry of feed.getElementsByTagName('entry')) {
    let title = entry.getElementsByTagName('title')[0]
      .childNodes[0].nodeValue;
    let url;
    for (let link of entry.getElementsByTagName('link')) {
      if (link.getAttribute('rel') === 'alternate') {
        url = link.getAttribute('href');
      }
    }
    let summaryElements = entry.getElementsByTagName('summary');
    let summary = '';
    if (summaryElements.length > 0) {
      if (summaryElements[0].childNodes.length > 0) {
        summary = summaryElements[0].childNodes[0].nodeValue;
      }
    }
    let listNode = document.createElement('li');
    listNode.appendChild(createAnchor(url, title, summary));
    yield listNode;
  }
}

function* parseRdf(xmlData) {
  let items = xmlData.getElementsByTagName('rdf:li');
  for (let item of items) {
    let listNode = document.createElement('li');
    let url = item.getAttribute('rdf:resource');
    listNode.appendChild(createAnchor(url, url));
    yield listNode;
  }
}

function createAnchor(href, text, title) {
  let maxTooltipLength = 400;
  let anchor = document.createElement('a');
  anchor.href = href;
  anchor.appendChild(document.createTextNode(text));
  if (title != undefined) {
    if (title.length > 512) {
      title = title.substring(0, maxTooltipLength) + '...';
    }
    anchor.title = title;
  }
  return anchor;
}
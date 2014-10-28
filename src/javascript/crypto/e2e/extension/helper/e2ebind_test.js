/**
 * @license
 * Copyright 2014 Yahoo Inc. All rights reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Tests for the wrapper of the e2ebind API.
 */

/** @suppress {extraProvide} */
goog.provide('e2e.ext.e2ebindTest');

goog.require('e2e.ext.constants');
goog.require('e2e.ext.e2ebind');
goog.require('goog.asserts');
goog.require('goog.testing.AsyncTestCase');
goog.require('goog.testing.PropertyReplacer');
goog.require('goog.testing.asserts');
goog.require('goog.testing.jsunit');
goog.setTestOnly();

var actions = e2e.ext.constants.e2ebind.requestActions;
var api = null;
var asyncTestCase = goog.testing.AsyncTestCase.createAndInstall(document.title);
var constants = e2e.ext.constants;
var draft = null;
var e2ebind = e2e.ext.e2ebind;
var stubs = new goog.testing.PropertyReplacer();
var RECIPIENTS = ['test@example.com' , 't2@example.com', 'cc@example.com'];


function setUp() {
  stubs.setPath('chrome.runtime.getURL', function(filename) {
    return './' + filename;
  });
  document.documentElement.id = 'test_id';
  draft = {
    to: 'test@example.com, "we <ird>>\'>, <a@a.com>, n<ess" <t2@example.com>' +
        ', "inv\"<alid <invalid@example.com>, fails#e2e.regexp.vali@dation.com',
    cc: 'cc@example.com',
    bcc: 'bcc@example.com',
    body: 'some text<br>with new<br>lines',
    from: 'yan@example.com',
    subject: 'encrypted msg',
    getTo: function() { return this.to; },
    setTo: function(value) { this.to = value; },
    getBcc: function() { return this.bcc; },
    setBcc: function(value) { this.bcc = value; },
    getCc: function() { return this.cc; },
    setCc: function(value) { this.cc = value; },
    getBody: function() { return this.body; },
    setBody: function(value) { this.body = value; },
    getFrom: function() { return this.from; },
    setFrom: function(value) { this.from = value; },
    getSubject: function() { return this.subject; },
    setSubject: function(value) { this.subject = value; }
  };
}


function tearDown() {
  stubs.reset();
  e2ebind.stop_();
}


function testStart() {
  assertEquals(undefined, e2ebind.messagingTable);
  e2ebind.start();
  goog.asserts.assertInstanceof(e2ebind.messagingTable, e2ebind.MessagingTable_);
}


function testMessagingTableAddAndGet() {
  var mt = new e2ebind.MessagingTable_();
  var action = 'irrelevant';
  var hash = mt.add(action, goog.nullFunction);
  var entry = mt.get(hash, action);
  assertEquals(entry.action, action);
  assertEquals(entry.callback, goog.nullFunction);
}


function testIsStarted() {
  assertFalse(e2ebind.isStarted());
  e2ebind.started_ = true;
  assertTrue(e2ebind.isStarted());
}


function testE2ebindIconClick() {
  var clickHandled = false;
  window.config = {};

  stubs.replace(e2ebind, 'sendExtensionRequest_', function(request, cb) {
    if (request.action === constants.Actions.GET_KEYRING_UNLOCKED) {
      cb({content: true, completedAction: request.action});
    }
  });
  stubs.replace(e2ebind, 'hasDraft', function() {
    clickHandled = true;
  });

  e2ebind.start();

  var icon = document.createElement('div');
  icon.id = constants.ElementId.E2EBIND_ICON;
  document.body.appendChild(icon);
  icon.click();

  asyncTestCase.waitForAsync('Waiting for e2ebind icon click handler.');
  window.setTimeout(function() {
    assertTrue(clickHandled);
    asyncTestCase.continueTesting();
  }, 500);
}


function testSendRequest() {
  var requestSent = false;
  var action = 'irrelevant';
  e2ebind.start();
  e2ebind.sendRequest(action, null, function(response) {
    requestSent = true;
  });

  window.addEventListener('message', function(msg) {
    var responseObj = window.JSON.parse(msg.data);
    if (msg.source === window.self &&
        responseObj.api === 'e2ebind') {
      e2ebind.handleProviderResponse_(responseObj);
    }
  });

  asyncTestCase.waitForAsync('Waiting for request to be sent by e2ebind');
  window.setTimeout(function() {
    assertTrue(requestSent);
    asyncTestCase.continueTesting();
  }, 500);
}


function testProviderRequestToStart() {
  var signer = 'irrelevant';
  stubs.replace(e2ebind, 'validateSigner_', goog.nullFunction);
  e2ebind.handleProviderRequest_({
    action: actions.START,
    args: {signer: signer, version: 0, read_glass_enabled: true}
  });
  assertTrue(e2ebind.started_);
  assertEquals(window.config.signer, signer);
  assertEquals(window.config.version, '0');
  assertTrue(window.config.read_glass_enabled);
  assertFalse(window.config.compose_glass_enabled);
}

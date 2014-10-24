// Copyright 2014 Yahoo Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/**
 * @fileoverview Provides a wrapper around the E2E bind API for interacting
 *   with Yahoo Mail.
 * @author Jonathan Pierce <jonathanpierce@outlook.com>
 * @author Yan Zhu <yzhu@yahoo-inc.com>
 */

goog.provide('e2e.ext.e2ebind');

goog.require('e2e.ext.constants');
goog.require('e2e.ext.ui.ComposeGlassWrapper');
goog.require('e2e.ext.ui.GlassWrapper');
goog.require('e2e.ext.utils.text');
goog.require('e2e.openpgp.asciiArmor');
goog.require('goog.Uri');
goog.require('goog.array');
goog.require('goog.events');
goog.require('goog.events.EventType');
goog.require('goog.string');
goog.require('goog.structs.Map');


goog.scope(function() {
var e2ebind = e2e.ext.e2ebind;
var ext = e2e.ext;
var constants = ext.constants;
var messages = ext.messages;
var utils = e2e.ext.utils;
var ui = ext.ui;


/**
 * True if e2ebind has been started.
 * @type {boolean}
 * @private
 */
e2ebind.started_ = false;


/**
 * Checks if e2ebind has been started.
 * @return {boolean}
 */
e2ebind.isStarted = function() {
  return e2ebind.started_;
};


/**
* Hash table for associating unique IDs with request/response pairs
* @constructor
* @private
*/
e2ebind.MessagingTable_ = function() {
  this.table = {};
};


/**
 * Generates a short, non-cryptographically random string.
 * @return {string}
 */
e2ebind.MessagingTable_.getRandomString = function() {
  return goog.string.getRandomString();
};


/**
 * Adds an entry to the hash table.
 * @param {string} action The action associated with the entry.
 * @param {function=} callback The callback associated with the entry.
 * @return {string} The hash value.
 */
e2ebind.MessagingTable_.add = function(action, callback) {
  var hash = this.getRandomString();
  while (this.table[hash]) {
    // Ensure unqiueness.
    hash = this.getRandomString();
  }
  this.table[hash] = {
    action: action,
    callback: callback
  };
  return hash;
};


/**
* Retrieves the callback associated with a hash value and an action.
* @param {string} hash
* @param {string} action
* @return {{action:string,callback:function=}} The record associated with
*   the hash, or null if not found
*/
e2ebind.MessagingTable_.get = function(hash, action) {
  var result = null;
  if (this.table[hash] && this.table[hash].action === action) {
    result = this.table[hash];
  }
  this.table[hash] = null;
  return result;
};


/**
* Start listening for responses and requests to/from the provider.
*/
e2ebind.start = function() {
  var uri = new goog.Uri(window.location.href);
  // Use the version of YMail that has the endtoend module included.
  if (!uri.getParameterValue('endtoend')) {
    uri.setParameterValue('endtoend', 1);
    uri.setParameterValue('composev3', 0);
    window.location.href = uri.toString();
    return;
  }

  window.onmessage = goog.bind(function(response) {
    var result;
    try {
      /** @type {{api:string,hash:string,action:string,source:string}} */
      var responseObj = window.JSON.parse(response.data);
      if (response.source !== window.self ||
          response.origin !== window.location.origin ||
          responseObj.api !== 'e2ebind' ||
          responseObj.source !== 'E2E') {
        return;
      }

      if (data.action.toUpperCase() in constants.e2ebind.requestActions) {
        this.handleProviderRequest_(data);
      } else if (
        data.action.toUpperCase() in constants.e2ebind.responseActions) {
        this.handleProviderResponse_(data);
      }
    } catch (e) {
      return;
    }
  }, this);

  // Listen for when the encryption icon is clicked in YMail.
  goog.events.listen(window, goog.events.EventType.CLICK, goog.bind(
    function(e) {
    var elt = e.target;

    if (elt.id === 'endtoend') {
      this.sendExtensionRequest_({
        action: constants.Actions.GET_KEYRING_UNLOCKED
      }, goog.bind(function(response) {
        if (response.error) {
          // Can't install compose glass if the keyring is locked
          window.alert(chrome.i18n.getMessage('glassKeyringLockedError'));
        } else {
          // Get the compose window associated with the clicked icon
          var composeElem = goog.dom.getAncestorByTagNameAndClass(elt,
                                                                 'div',
                                                                 'compose');
          var draft = {};
          draft.from = '<' + window.config.signer + '>';

          e2ebind.hasDraft(goog.bind(function(hasDraftResult) {
            if (hasDraftResult.has_draft) {
              e2ebind.getDraft(goog.bind(function(getDraftResult) {
                draft.body = e2e.openpgp.asciiArmor.
                  extractPgpBlock(getDraftResult.body);
                draft.to = getDraftResult.to;
                draft.cc = getDraftResult.from;
                draft.bcc = getDraftResult.bcc;
                draft.subject = getDraftResult.subject;
                // Compose glass implementation will be in a future patch.
                //e2ebind.installComposeGlass_(composeElem, draft);
              }, this));
            } else {
              e2ebind.getCurrentMessage(goog.bind(function(result) {
                var DOMelem = document.querySelector(result.elem);
                if (result.text) {
                  draft.body = result.text;
                } else if (DOMelem) {
                  draft.body = e2e.openpgp.asciiArmor.extractPgpBlock(
                    goog.isDef(DOMelem.lookingGlass) ?
                    DOMelem.lookingGlass.getOriginalContent() :
                    DOMelem.innerText
                  );
                }
                //e2ebind.installComposeGlass_(composeElem, draft);
              }, this));
            }
          }, this));
        }
      }, this));
    }
  }, this), true);
};


/**
* Sends a request to the provider.
* @param {string} action The action requested.
* @param {Object} args The arguments to the action.
* @param {function=} callback The function to callback with the response
*/
e2ebind.sendRequest = function(action, args, callback) {
  var reqObj = /** @type {messages.e2ebindRequest} */ ({
    api: 'e2ebind',
    source: 'E2E',
    action: action,
    args: args,
    hash: this.MessagingTable_.add(action, callback)
  });

  window.console.log('e2ebind sending message to page', reqObj);
  window.postMessage(window.JSON.stringify(reqObj), window.location.origin);
};


/**
* Sends a response to a request from a provider
* @param {Object} result The result field of the response message
* @param {Object} request The request we are responding to
* @param {boolean} success Whether or not the request was successful.
* @private
*/
e2ebind.sendResponse_ = function(result, request, success) {
  var returnObj = /** @type {messages.e2ebindResponse} */ ({
    api: 'e2ebind',
    result: result,
    success: success,
    action: request.action,
    hash: request.hash,
    source: 'E2E'
  });

  window.postMessage(window.JSON.stringify(returnObj), window.location.origin);
};


/**
* Handles a response to a request we sent
* @param {Object} response The provider's response to a request we sent.
* @private
*/
e2ebind.handleProviderResponse_ = function(response) {
  var request = this.MessagingTable_.get(response.hash, response.action);

  if (!request) {
    return;
  }

  if (request.callback) {
    request.callback(response);
  }
};


/**
* Handle an incoming request from the provider.
* @param {Object} request The request from the provider.
* @private
*/
e2ebind.handleProviderRequest_ = function(request) {
  var actions = constants.e2ebind.requestActions;

  if (request.action !== actions.START && !e2ebind.started_) {
    return;
  }

  var args = request.args;

  switch (request.action) {
    case actions.START:
      (function() {
        console.log('e2e got request to start');
        if (!e2ebind.started_) {
          // Note that we've attempted to start, and set the config
          e2ebind.started_ = true;
          window.config = {
            signer: String(args.signer),
            version: String(args.version),
            read_glass_enabled: Boolean(args.read_glass_enabled),
            compose_glass_enabled: Boolean(args.compose_glass_enabled)
          };

          // Verify the signer
          e2ebind.validateSigner_(String(args.signer), function(valid) {
            window.valid = valid;
            e2ebind.sendResponse_({valid: valid}, request, true);
          });
        } else {
          // We've already started. Dispose.
          e2ebind.sendResponse_(null, request, false);
          window.helper.dispose();
        }
      })();

      break;

    case actions.INSTALL_READ_GLASS:
      (function() {
        if (window.config.read_glass_enabled && args.messages && args.mode &&
            window.valid) {
          try {
            goog.array.forEach(args.messages, function(message) {
              // XXX: message.elem is a selector string, not a DOM element
              var DOMelem = document.querySelector(message.elem);
              var selector = message.elem;
              e2ebind.installReadGlass_(DOMelem,
                                message.text,
                                String(args.mode),
                                selector);
            });
            e2ebind.sendResponse_(null, request, true);
          } catch (ex) {
            e2ebind.sendResponse_(null, request, false);
          }
        }
      })();

      break;

    case actions.INSTALL_COMPOSE_GLASS:
      // TODO: Support compose glass in YMail
      break;

    case actions.SET_SIGNER:
      (function() {
        // validates and updates the signer/validity in E2E
        if (!args.signer) {
          return;
        }
        window.config.signer = String(args.signer);
        try {
          e2ebind.validateSigner_(String(args.signer), function(valid) {
            window.valid = valid;
            e2ebind.sendResponse_({valid: valid}, request, true);
          });
        } catch (ex) {
          e2ebind.sendResponse_(null, request, false);
        }
      })();

      break;

    case actions.VALIDATE_SIGNER:
      (function() {
        try {
          if (!args.signer) {
            return;
          }
          e2ebind.validateSigner_(String(args.signer), function(valid) {
            e2ebind.sendResponse_({valid: valid}, request, true);
          });
        } catch (ex) {
          e2ebind.sendResponse_(null, request, false);
        }
      })();

      break;

    case actions.VALIDATE_RECIPIENTS:
      (function() {
        try {
          if (!args.recipients || !(args.recipients instanceof Array) ||
             !window.valid) {
            return;
          }
          e2ebind.validateRecipients_(args.recipients, function(results) {
            e2ebind.sendResponse_({results: results}, request, true);
          });
        } catch (ex) {
          e2ebind.sendResponse_(null, request, false);
        }
      })();

      break;
  }
};


/**
* Installs a read looking glass in the page.
* @param {Element} elem  element to install the glass in
* @param {string=} text Optional alternative text to elem's innerText
* @param {string=} mode String literal 'scroll' or 'resize', indicating glass's behavior
* @param {string=} selector selector for the element to install glass in
*   (needed for resizing/scrolling)
* @private
*/
e2ebind.installReadGlass_ = function(elem, text, mode, selector) {
  var DOMelem = elem;
  text = text ? String(text) : null;

  if (!DOMelem) {
    throw 'Element not found.';
  }

  if (Boolean(DOMelem.lookingGlass)) {
    console.log('DOM element has lookingGlass');
    return;
  }

  var selectionBody = e2e.openpgp.asciiArmor.extractPgpBlock(
    text ? text : DOMelem.innerText
  );
  var action = utils.text.getPgpAction(selectionBody, true);

  if (action == constants.Actions.DECRYPT_VERIFY) {
    var glassWrapper = new ui.GlassWrapper(DOMelem);
    window.helper.registerDisposable(glassWrapper);
    glassWrapper.installGlass();
  }
};


/**
* Installs a compose glass in the page. Not called.
* @param {Element} elem element to install the glass in
* @param {Object} draft The draft content to put in the glass
* @param {string=} mode String literal 'scroll' or 'resize', indicating glass's behavior
*   (needed for resizing/scrolling)
* @private
*/
e2ebind.installComposeGlass_ = function(elem, draft, mode) {
  var DOMelem = elem;

  if (!DOMelem) {
    throw 'Element not found.';
  }

  if (Boolean(DOMelem.composeGlass)) {
    console.log('DOM element already has composeGlass');
    return;
  }

  var hash = this.MessagingTable_.getRandomString();
  var glassWrapper = new ui.ComposeGlassWrapper(elem, draft, mode, hash);
  window.helper.registerDisposable(glassWrapper);
  glassWrapper.installGlass();

  var closeHandler = function(message) {
    if (message.e2ebind && message.glass_closed &&
        (message.hash === glassWrapper.hash)) {
      console.log('e2ebind got glass closed');
      glassWrapper.dispose();
      chrome.runtime.onMessage.removeListener(closeHandler);
    }
  };

  // Listen for when the glass should be removed
  chrome.runtime.onMessage.addListener(closeHandler);
};


/**
* Gets the currently selected message, if any, from the provider
* @param {!function} callback The callback to call with the result
*/
e2ebind.getCurrentMessage = function(callback) {
  this.sendRequest(constants.e2ebind.responseActions.GET_CURRENT_MESSAGE,
                   null, function(data) {
    var elem = null;
    var text = null;

    if (data.result && data.success) {
      var result = data.result;
      elem = result.elem ? result.elem : null;
      text = result.text ? result.text : null;
    }

    callback({elem: elem, text: text});
  });
};


/**
* Gets the current draft/compose from the provider.
* @param {!function} callback - The callback to call with the result
*/
e2ebind.getDraft = function(callback) {
  this.sendRequest(constants.e2ebind.responseActions.GET_DRAFT, null,
                   function(data) {
    var result = null;

    if (data.success) {
      result = data.result;
    }

    callback(result);
  });
};


/**
 * Indicates if there is an active draft in the provider.
 * @param {!function(boolean)} callback The callback where the active draft
 *     information should be passed.
 */
e2ebind.hasDraft = function(callback) {
  this.sendRequest(constants.e2ebind.responseActions.HAS_DRAFT, null,
                   function(data) {
    var result = {has_draft: false};

    if (data.success && data.result.has_draft) {
      result.has_draft = true;
    }

    callback(result);
  });
};


/**
* Sets the currently active draft/compose in the provider
* @param {Object} args The data to set the draft with.
*/
e2ebind.setDraft = function(args) {
  // TODO(yan): Doesn't work when multiple provider compose windows are open
  // on the same page
  this.sendRequest('set_draft', {
    to: args.to || [],
    cc: args.cc || [],
    bcc: args.bcc || [],
    subject: args.subject || '',
    body: args.body || ''
  }, null);
};


/**
* Validates whather or not we have a private key for this signer.
* @param {string} signer The signer ("name@domain.com") we wish to validate
* @param {!function} callback Callback to call with the result.
* @private
*/
e2ebind.validateSigner_ = function(signer, callback) {
  this.sendExtensionRequest_({
    action: constants.Actions.LIST_ALL_UIDS,
    content: 'private'
  }, function(response) {
    response.content = response.content || [];
    var emails = utils.text.getValidEmailAddressesFromArray(response.content,
                                                            true);
    var valid = goog.array.contains(emails, signer)
    callback(valid);
  });
};


/**
* Validates whether we have a public key for these recipients.
* @param {Array.<string>} recipients The recipients we are checking
* @param {!function} callback Callback to call with the result.
* @private
*/
e2ebind.validateRecipients_ = function(recipients, callback) {
  this.sendExtensionRequest_({
    action: constants.Actions.LIST_ALL_UIDS,
    content: 'public'
  }, function(response) {
    response.content = response.content || [];
    var emails = utils.text.getValidEmailAddressesFromArray(response.content,
                                                            true);
    var results = [];
    goog.array.forEach(recipients, function(recipient) {
      var valid = goog.array.contains(emails, recipient);
      results.push({valid: valid, recipient: recipient});
    });
    callback(results);
  });
};


/**
* Sends a request to the launcher to perform some action.
* @param {Object} args The message we wish to send to the launcher,
*   should heve an 'action' property.
* @param {!function} callback Callback to call with the result.
* @private
*/
e2ebind.sendExtensionRequest_ = function(args, callback) {
  var port = chrome.runtime.connect();
  port.postMessage(args);

  var respHandler = function(response) {
    console.log('E2E REQUEST SUCCESS: ' + JSON.stringify(message));
    if (callback) {
      callback(response);
    }
    port.disconnect();
  };
  port.onMessage.addListener(respHandler);
  port.onDisconnect.addListener(function() {
    port = null;
  });
};

}); // goog.scope

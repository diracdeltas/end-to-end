goog.provide('e2e.ext.mime.types');

/**
 * @typedef {{body: string,
 *     attachments: (Array.<!e2e.ext.mime.Attachment>|undefined)}}
 */
e2e.ext.mime.types.MailContent;


/**
 * @typedef {{filename: string,
 *     content: !e2e.ByteArray}}
 */
e2e.ext.mime.types.Attachment;

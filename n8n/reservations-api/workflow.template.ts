import { workflow, node, trigger, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

const sheetsCred = { googleSheetsOAuth2Api: { id: '__SHEETS_CREDENTIAL_ID__', name: 'Google Sheets account' } };
const doc = { __rl: true, mode: 'list', value: '__KB_SHEET_ID__', cachedResultName: 'SupportFlow AI Knowledge Base' };
const readOptions = { outputFormatting: { values: { general: 'FORMATTED_VALUE', date: 'FORMATTED_STRING' } } };
const reservationColumns = {
  'Reservation ID': expr("{{ $json.row['Reservation ID'] }}"),
  'Customer Name': expr("{{ $json.row['Customer Name'] }}"),
  'Customer Email': expr("{{ $json.row['Customer Email'] }}"),
  'Date': expr('{{ $json.row.Date }}'),
  'Time': expr('{{ $json.row.Time }}'),
  'Number of Guests': expr("{{ $json.row['Number of Guests'] }}"),
  'Status': expr('{{ $json.row.Status }}')
};
const reservationSchema = __SCHEMA__;

const apiWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Reservations API Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'supportflow-reservations',
      authentication: 'none',
      responseMode: 'responseNode',
      // No ignoreBots: it rejects server-to-server calls (curl, Node, axios user agents).
      options: {}
    }
  }
});

// The key is checked here rather than with the Webhook node's Header Auth; see check_api_key.js.
const checkApiKey = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Check API Key', parameters: { jsCode: __CHECKKEY__ } }
});

const isAuthorized = ifElse({
  version: 2.2,
  config: {
    name: 'Authorized?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: 'is-authorized', leftValue: expr('{{ $json.authorized }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      },
      options: {}
    }
  }
});

const respondUnauthorized = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Unauthorized',
    parameters: {
      respondWith: 'json',
      responseBody: expr("{{ JSON.stringify({ success: false, error: { code: 'unauthorized', message: 'Missing or invalid API key.' } }) }}"),
      options: { responseCode: 401, responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] } }
    }
  }
});

const validateRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Validate Request', parameters: { jsCode: __VALIDATE__ } }
});

const isValid = ifElse({
  version: 2.2,
  config: {
    name: 'Valid Request?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: 'is-valid', leftValue: expr('{{ $json.valid }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      },
      options: {}
    }
  }
});

const loadAvailability = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Load Availability',
    executeOnce: true,
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 1000,
    onError: 'continueErrorOutput',
    parameters: { documentId: doc, sheetName: { __rl: true, mode: 'name', value: 'Availability' }, options: readOptions },
    credentials: sheetsCred
  }
});

const loadReservations = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Load Reservations',
    executeOnce: true,
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 1000,
    onError: 'continueErrorOutput',
    parameters: { documentId: doc, sheetName: { __rl: true, mode: 'name', value: 'Reservations' }, options: readOptions },
    credentials: sheetsCred
  }
});

const decide = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Decide', onError: 'continueErrorOutput', parameters: { jsCode: __DECIDE__ } }
});

const routeWrite = switchCase({
  version: 3.2,
  config: {
    name: 'Write Needed?',
    parameters: {
      rules: {
        values: [
          { outputKey: 'New booking', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.op }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'append' }], combinator: 'and' } },
          { outputKey: 'Change booking', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.op }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'update' }], combinator: 'and' } }
        ]
      },
      options: { fallbackOutput: 'extra', renameFallbackOutput: 'No write' }
    }
  }
});

const saveReservation = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Save Reservation',
    onError: 'continueErrorOutput',
    parameters: {
      operation: 'append',
      documentId: doc,
      sheetName: { __rl: true, mode: 'name', value: 'Reservations' },
      columns: { mappingMode: 'defineBelow', value: reservationColumns, schema: reservationSchema },
      options: { cellFormat: 'RAW' }
    },
    credentials: sheetsCred
  }
});

const updateReservation = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Update Reservation',
    onError: 'continueErrorOutput',
    parameters: {
      operation: 'update',
      documentId: doc,
      sheetName: { __rl: true, mode: 'name', value: 'Reservations' },
      columns: { mappingMode: 'defineBelow', matchingColumns: ['Reservation ID'], value: reservationColumns, schema: reservationSchema },
      options: { cellFormat: 'RAW' }
    },
    credentials: sheetsCred
  }
});

const confirmSaved = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Confirm Saved', onError: 'continueErrorOutput', parameters: { jsCode: __CONFIRM__ } }
});

const buildError = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Build Error Response', parameters: { jsCode: __ERROR__ } }
});

const respond = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond to Webhook',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ JSON.stringify($json.body) }}'),
      options: {
        responseCode: expr('{{ $json.http_status }}'),
        responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] }
      }
    }
  }
});

export default workflow('supportflow-reservations', 'SupportFlow AI - Reservations API')
  .add(apiWebhook)
  .to(checkApiKey)
  .to(isAuthorized
    .onTrue(validateRequest)
    .onFalse(respondUnauthorized))
  .add(validateRequest)
  .to(isValid
    .onTrue(loadAvailability.to(loadReservations.to(decide)))
    .onFalse(buildError))
  .add(loadAvailability.onError(buildError))
  .add(loadReservations.onError(buildError))
  .add(decide.onError(buildError))
  .to(routeWrite
    .onCase(0, saveReservation.to(confirmSaved))
    .onCase(1, updateReservation.to(confirmSaved))
    .onCase(2, respond))
  .add(saveReservation.onError(buildError))
  .add(updateReservation.onError(buildError))
  .add(confirmSaved.onError(buildError))
  .to(respond)
  .add(buildError)
  .to(respond);

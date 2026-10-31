import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const sheetsCred = { googleSheetsOAuth2Api: { id: '__SHEETS_CREDENTIAL_ID__', name: 'Google Sheets account' } };

const apiWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Support API Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'supportflow-ai-api',
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

const loadKb = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Load Knowledge Base',
    executeOnce: true,
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
    parameters: {
      documentId: { __rl: true, mode: 'list', value: '__KB_SHEET_ID__', cachedResultName: 'SupportFlow AI Knowledge Base', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/__KB_SHEET_ID__/edit?usp=drivesdk' },
      sheetName: { __rl: true, mode: 'name', value: 'Knowledge Base' },
      options: {}
    },
    credentials: sheetsCred
  }
});

const findMatch = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Find Best FAQ Match', onError: 'continueErrorOutput', parameters: { jsCode: __FIND__ } }
});

const needsAi = ifElse({
  version: 2.2,
  config: {
    name: 'Needs AI?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: 'route-ai', leftValue: expr('{{ $json.route }}'), rightValue: 'ai', operator: { type: 'string', operation: 'equals' } }],
        combinator: 'and'
      },
      options: {}
    }
  }
});

const askGemini = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Ask Gemini',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googlePalmApi',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.gemini_request) }}'),
      options: { timeout: 30000 }
    },
    credentials: { googlePalmApi: { id: '__GEMINI_CREDENTIAL_ID__', name: 'Google Gemini(PaLM) Api account' } }
  }
});

const finalizeAnswer = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Finalize Answer', onError: 'continueErrorOutput', parameters: { jsCode: __FINALIZE__ } }
});

const saveTicket = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Save Ticket to Sheet',
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueRegularOutput',
    parameters: {
      operation: 'append',
      documentId: { __rl: true, mode: 'list', value: '__TICKETS_SHEET_ID__', cachedResultName: 'SupportFlow_AI_Tickets', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/__TICKETS_SHEET_ID__/edit?usp=drivesdk' },
      sheetName: { __rl: true, mode: 'list', value: 285209571, cachedResultName: 'Tickets', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/__TICKETS_SHEET_ID__/edit#gid=285209571' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          'Timestamp': expr('{{ $json.timestamp }}'),
          'Customer Name': expr('{{ $json.customer_name }}'),
          'Customer Email': expr('{{ $json.customer_email }}'),
          'Original Message': expr('{{ $json.original_message }}'),
          'Category': expr('{{ $json.category }}'),
          'Priority': expr('{{ $json.priority }}'),
          'Suggested Response': expr('{{ $json.customer_reply }}'),
          'Requires Human': expr('{{ $json.requires_human }}'),
          'Intent': expr('{{ $json.intent }}'),
          'Knowledge Source': expr('{{ $json.knowledge_source }}'),
          'Action Taken': expr('{{ $json.action_taken }}'),
          'Resolution Status': expr('{{ $json.resolution_status }}')
        },
        schema: __SCHEMA__
      },
      options: {}
    },
    credentials: sheetsCred
  }
});

const needsEscalation = ifElse({
  version: 2.2,
  config: {
    name: 'Needs Escalation?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'needs-human', leftValue: expr('{{ $(\'Finalize Answer\').item.json.requires_human }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      },
      options: {}
    }
  }
});

const notifyTeam = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Notify Support Team',
    retryOnFail: true,
    maxTries: 2,
    onError: 'continueRegularOutput',
    parameters: {
      sendTo: "__SUPPORT_EMAIL__",
      subject: expr('[{{ $("Finalize Answer").item.json.priority }}] Support request from {{ $("Finalize Answer").item.json.customer_name }}'),
      message: expr(__EMAIL__),
      options: { appendAttribution: false }
    },
    credentials: { gmailOAuth2: { id: '__GMAIL_CREDENTIAL_ID__', name: 'Gmail account' } }
  }
});

const buildResponse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Build Response', onError: 'continueErrorOutput', parameters: { jsCode: __BUILD__ } }
});

const respondSuccess = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond to Webhook',
    parameters: {
      respondWith: 'firstIncomingItem',
      options: { responseCode: 200, responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] } }
    }
  }
});

const respondError = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond with Error',
    parameters: {
      respondWith: 'json',
      responseBody: expr(__ERRBODY__),
      options: {
        responseCode: expr('{{ $json.valid === false ? 400 : 500 }}'),
        responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] }
      }
    }
  }
});

export default workflow('supportflow-ai-api', 'SupportFlow AI - API')
  .add(apiWebhook)
  .to(checkApiKey)
  .to(isAuthorized
    .onTrue(validateRequest)
    .onFalse(respondUnauthorized))
  .add(validateRequest)
  .to(isValid
    .onTrue(loadKb.to(findMatch))
    .onFalse(respondError))
  .add(findMatch.onError(respondError))
  .to(needsAi
    .onTrue(askGemini.to(finalizeAnswer))
    .onFalse(finalizeAnswer))
  .add(finalizeAnswer.onError(respondError))
  .to(saveTicket)
  .to(needsEscalation
    .onTrue(notifyTeam.to(buildResponse))
    .onFalse(buildResponse))
  .add(buildResponse.onError(respondError))
  .to(respondSuccess);

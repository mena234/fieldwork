# Methodology templates

Start from a downloaded template or one of `templates/*-v1.json`. Change `version` to a new positive integer. Keep the desired workflow `stage`: `baseline`, `consent`, `boundary`, `implementation`, or `monitoring`.

Each template needs a bilingual `name`, an ordered `fields` array of 1–50 fields, and a `project_id`. The admin UI replaces the project ID with the current assigned project and the server allocates the immutable template ID and publication time.

```json
{
  "project_id": "11111111-1111-4111-8111-111111111111",
  "stage": "monitoring",
  "version": 2,
  "name": { "en": "Annual monitoring", "hi": "वार्षिक निगरानी" },
  "fields": [
    {
      "id": "issues",
      "type": "boolean",
      "label": { "en": "Issues observed?", "hi": "क्या समस्याएँ देखी गईं?" },
      "section": { "en": "Monitoring", "hi": "निगरानी" },
      "required": true
    },
    {
      "id": "issue_details",
      "type": "text",
      "label": { "en": "Describe the issues", "hi": "समस्याओं का विवरण" },
      "section": { "en": "Monitoring", "hi": "निगरानी" },
      "required": true,
      "visible_when": { "field": "issues", "equals": true }
    }
  ]
}
```

Supported field types: `text`, `number`, `date`, `select`, `multiselect`, `boolean`, `gps`, `photo`. Field IDs are unique lowercase identifiers with optional underscores/digits. Every field needs English/Hindi labels and sections. Number fields accept `min` and `max`. Select fields require bilingual options of the form `{ "value": "stable-code", "label": { "en": "…", "hi": "…" } }`.

Conditions reference an earlier field and compare a string or boolean. Hidden fields are excluded from required validation. Previously entered hidden answers are retained so switching an answer does not destroy data. Collectors see the chosen language; persisted option values remain stable language-independent codes.

Consent templates additionally require `consent_statement.en` and `.hi`. Retain the `consent_granted` boolean if the farmer timeline should identify declined consent. Standard date/collector field IDs (`visit_date`, `consent_date`, `collector`, `respondent`) receive helpful defaults on new visits. There is no visual form builder.

In **Project settings → Publish a methodology template**, choose the JSON file. Client validation checks structure, references, labels, options, and ranges. The admin can review the validated stage/version/field count before publishing. The server validates the template again and rejects an existing project/stage/version. The default project seed defines one template per stage at version 1.

Sync publishes the newly downloaded version to the local library. Starting a new visit chooses the highest downloaded stage version. Continuing a draft reads that draft's immutable `template_id`; neither ongoing drafts nor submitted answers are silently migrated to a new methodology.

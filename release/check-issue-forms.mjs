import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { load as yamlParser } from "js-yaml";

const fieldIdPattern = /^[A-Za-z0-9_-]+$/u;
/**
 * @param {unknown} value - Value to inspect.
 * @returns {value is Record<string, unknown>} Whether the value is a mapping.
 */
const isMapping = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
/**
 * @param {unknown} value - Value to inspect.
 * @returns {value is string} Whether the value is a non-empty string.
 */
const nonEmptyString = (value) =>
  typeof value === "string" && value.trim() !== "";

/**
 * @param {Record<string, unknown>} form - Parsed form.
 * @param {(message: string) => number} report - Diagnostic receiver.
 */
const validateTopLevel = (form, report) => {
  const { body, description, name } = form;
  for (const [key, value] of Object.entries({ description, name })) {
    if (!nonEmptyString(value)) {
      report(`top-level ${key} must be a non-empty string.`);
    }
  }
  if (nonEmptyString(name)) {
    let length = 0;
    for (const _character of name.trim()) {
      length += 1;
    }
    if (length <= 3) {
      report("top-level name must contain more than 3 characters.");
    }
  }
  if (!Array.isArray(body) || body.length === 0) {
    report("top-level body must be a non-empty array.");
  }
};

/**
 * @param {unknown} id - Field identifier.
 * @param {string} fieldName - Field location.
 * @param {Set<string>} ids - Seen identifiers.
 * @param {(message: string) => number} report - Diagnostic receiver.
 */
const validateFieldId = (id, fieldName, ids, report) => {
  if (nonEmptyString(id)) {
    if (!fieldIdPattern.test(id)) {
      report(
        `${fieldName} id may contain only letters, numbers, hyphens, and underscores.`
      );
    }
    const normalizedId = id.toLowerCase();
    if (ids.has(normalizedId)) {
      report(`${fieldName} repeats field id ${id}.`);
    }
    ids.add(normalizedId);
  } else {
    report(`${fieldName} must have a non-empty string id.`);
  }
};

/**
 * @param {unknown} label - Field label.
 * @param {string} fieldName - Field location.
 * @param {Set<string>} labels - Seen labels.
 * @param {(message: string) => number} report - Diagnostic receiver.
 */
const validateFieldLabel = (label, fieldName, labels, report) => {
  if (nonEmptyString(label)) {
    const normalizedLabel = label.trim().toLowerCase();
    if (labels.has(normalizedLabel)) {
      report(`${fieldName} repeats field label ${label}.`);
    }
    labels.add(normalizedLabel);
  } else {
    report(`${fieldName} must have a non-empty string label.`);
  }
};

/**
 * @param {unknown} field - Parsed field.
 * @param {number} index - Field index.
 * @param {Set<string>} ids - Seen identifiers.
 * @param {Set<string>} labels - Seen labels.
 * @param {(message: string) => number} report - Diagnostic receiver.
 */
const validateTextarea = (field, index, ids, labels, report) => {
  const fieldName = `body[${index + 1}]`;
  if (!isMapping(field)) {
    report(`${fieldName} must be a mapping.`);
    return;
  }
  const { attributes, id, type, validations } = field;
  if (type !== "textarea") {
    report(`${fieldName} must use the textarea type.`);
  }
  validateFieldId(id, fieldName, ids, report);
  if (isMapping(attributes)) {
    const { description, label } = attributes;
    validateFieldLabel(label, fieldName, labels, report);
    if (!nonEmptyString(description)) {
      report(`${fieldName} must have a non-empty string description.`);
    }
  } else {
    report(`${fieldName} must have an attributes mapping.`);
  }
  if (!isMapping(validations) || validations.required !== true) {
    report(`${fieldName} must require a response.`);
  }
};

/**
 * Validate the repository issue-form fields.
 * @param {unknown} form - Parsed issue form.
 */
export const validateIssueForm = (form, source = "<form>") => {
  /** @type {string[]} */
  const errors = [];
  /** @param {string} message - Validation error. */
  const report = (message) => errors.push(`${source}: ${message}`);
  if (!isMapping(form)) {
    return [`${source}: issue form must be a YAML mapping.`];
  }
  const { body } = form;
  validateTopLevel(form, report);
  if (!Array.isArray(body) || body.length === 0) {
    return errors;
  }
  /** @type {Set<string>} */
  const ids = new Set();
  /** @type {Set<string>} */
  const labels = new Set();
  for (const [index, field] of body.entries()) {
    validateTextarea(field, index, ids, labels, report);
  }
  return errors;
};

/**
 * @param {string} content - YAML source.
 * @param {string} source - Source name for diagnostics.
 */
const parseIssueFormContent = (content, source) => {
  try {
    const form = yamlParser(content);
    return { errors: validateIssueForm(form, source), form, source };
  } catch (error) {
    const mark = isMapping(error) && isMapping(error.mark) ? error.mark : {};
    const line =
      typeof mark.line === "number" && Number.isInteger(mark.line)
        ? mark.line + 1
        : null;
    return {
      errors: [
        `${line === null ? source : `${source}:${line}`}: issue form must contain valid YAML.`
      ],
      form: null,
      source
    };
  }
};

/**
 * Validate issue forms together, including unique chooser names.
 * @param {{content: string, source: string}[]} forms - Issue form documents.
 */
export const validateIssueForms = (forms) => {
  const parsedForms = forms.map(({ content, source }) =>
    parseIssueFormContent(content, source)
  );
  const errors = parsedForms.flatMap(({ errors: formErrors }) => formErrors);
  const names = new Set();
  for (const { form, source } of parsedForms) {
    if (isMapping(form) && nonEmptyString(form.name)) {
      const name = form.name.trim().toLowerCase();
      if (names.has(name)) {
        errors.push(
          `${source}: top-level name must be unique across issue forms.`
        );
      }
      names.add(name);
    }
  }
  return errors;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const directory = path.join(root, ".github/ISSUE_TEMPLATE");
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
    .map((entry) => path.join(directory, entry.name))
    .toSorted();
  const forms = files.map((file) => ({
    content: readFileSync(file, "utf-8"),
    source: path.relative(root, file)
  }));
  const errors =
    files.length === 0
      ? [".github/ISSUE_TEMPLATE: no .yaml issue forms were found."]
      : validateIssueForms(forms);
  if (errors.length > 0) {
    for (const error of errors) {
      process.stderr.write(`${error}\n`);
    }
    process.exitCode = 1;
  } else {
    process.stdout.write(`Validated ${files.length} GitHub issue forms.\n`);
  }
}

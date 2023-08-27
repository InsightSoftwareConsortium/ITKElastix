// Generated file. To retain edits, remove this comment.

function downloadFile(content, filename) {
  const url = URL.createObjectURL(new Blob([content]))
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'download'
  document.body.appendChild(a)
  function clickHandler(event) {
    setTimeout(() => {
      URL.revokeObjectURL(url)
      a.removeEventListener('click', clickHandler)
    }, 200)
  };
  a.addEventListener('click', clickHandler, false)
  a.click()
  return a
}
globalThis.downloadFile = downloadFile

function interfaceTypeJsonReplacer (key, value) {
  if (!!value && value.byteLength !== undefined) {
    return String(value.slice(0, 6)) + '...'
  }
  return value
}
globalThis.interfaceTypeJsonReplacer = interfaceTypeJsonReplacer

function escapeHtml(html) {
  const div = document.createElement('div');
  div.textContent = html;
  const escaped = div.innerHTML;
  div.remove()
  return escaped
}
globalThis.escapeHtml = escapeHtml

function notify(title, message, variant = 'primary', icon = 'info-circle', duration = 3000) {
  const slAlert = Object.assign(document.createElement('sl-alert'), {
    variant,
    closable: true,
    duration: duration,
    innerHTML: `
      <sl-icon name="${icon}" slot="icon"></sl-icon>
      <strong>${escapeHtml(title)}</strong><br />
      ${escapeHtml(message)}
    `
  });

  document.body.append(slAlert);
  setTimeout(() => slAlert.toast(), 300)
}
globalThis.notify = notify

function disableInputs(inputId) {
  document.querySelectorAll(`#${inputId} sl-button`).forEach(button => {
    button.disabled = true
  })
  document.querySelector(`#${inputId} sl-button[name="run"]`).loading = true
  document.querySelectorAll(`#${inputId} sl-checkbox`).forEach(checkbox => {
    checkbox.disabled = true
  })
  document.querySelectorAll(`#${inputId} sl-input`).forEach(input => {
    input.disabled = true
  })
}
globalThis.disableInputs = disableInputs

function enableInputs(inputId) {
  document.querySelectorAll(`#${inputId} sl-button`).forEach(button => {
    button.disabled = false
  })
  document.querySelector(`#${inputId} sl-button[name="run"]`).loading = false
  document.querySelectorAll(`#${inputId} sl-checkbox`).forEach(checkbox => {
    checkbox.disabled = false
  })
  document.querySelectorAll(`#${inputId} sl-input`).forEach(input => {
    input.disabled = false
  })
}
globalThis.enableInputs = enableInputs

function applyInputParsedJson(inputElement, modelMap, parameterName) {
  try {
    const parsedJson = JSON.parse(inputElement.value)
    modelMap.set(parameterName, parsedJson)
    inputElement.setCustomValidity('')
  } catch (error) {
    inputElement.setCustomValidity(error.message)
  }
}
globalThis.applyInputParsedJson = applyInputParsedJson

function renderContractForm(contractId, interfaceString, divId = 'explore-form') {
  const container = document.getElementById(divId);
  container.innerHTML = '';
  const methodRegex = /fn\s+(\w+)\s*\(\s*env:[^)]*?\)\s*(->\s*[^;{]+)?;?/g;
  const argsRegex = /(\w+)\s*:\s*([^,\)]+)/g;
  let match;
  while ((match = methodRegex.exec(interfaceString)) !== null) {
    const methodName = match[1];
    const signature = match[0];
    const args = [];
    const argsPart = signature.substring(signature.indexOf('(') + 1, signature.lastIndexOf(')'));
    let argMatch;
    while ((argMatch = argsRegex.exec(argsPart)) !== null) {
      const [_, argName, rawType] = argMatch;
      const type = rawType.trim().replace(/soroban_sdk::/g, '');
      if (argName.trim() !== 'env') {
        args.push({ name: argName.trim(), type });
      }
    }
    const wrapper = document.createElement('div');
    wrapper.classList.add('method-box');
    const isMultiArg = args.length > 1;
    if (args.length <= 1) {
      wrapper.classList.add('method-compact');
    }
    if (args.length === 0) {
      wrapper.classList.add('method-no-args');
    }
    if (isMultiArg) {
      wrapper.classList.add('method-multi');
    }
    const left = document.createElement('div');
    left.classList.add('method-left');
    const title = document.createElement('h3');
    title.textContent = methodName;
    const button = document.createElement('button');
    button.classList.add('method-call-button');
    button.innerHTML = '<i class="fas fa-paper-plane"></i>';
    button.setAttribute('aria-label', `Call ${methodName}`);
    button.setAttribute('title', `Call ${methodName}`);
    if (!isMultiArg) {
      left.appendChild(title);
    }
    args.forEach((arg, index) => {
      const row = document.createElement('div');
      row.classList.add('arg-row');
      const label = document.createElement('label');
      label.textContent = `${arg.name}:${arg.type}`;
      label.classList.add('arg-label');
      label.htmlFor = `${methodName}-${arg.name}`;
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `${methodName}-${arg.name}`;
      input.placeholder = `${arg.name}:${arg.type}`;
      input.setAttribute('aria-label', `${arg.name}: ${arg.type}`);
      if (isMultiArg) {
        row.classList.add('arg-row-multi');
        const titleCell = document.createElement('div');
        titleCell.classList.add('method-title-cell');
        if (index === 0) {
          titleCell.appendChild(title);
        } else {
          const spacer = document.createElement('span');
          spacer.classList.add('method-title-spacer');
          titleCell.appendChild(spacer);
        }
        const fieldCell = document.createElement('div');
        fieldCell.classList.add('method-field-cell');
        fieldCell.append(input, label);
        if (index === args.length - 1) {
          fieldCell.appendChild(button);
        }
        row.append(titleCell, fieldCell);
      } else {
        if (args.length <= 1) {
          row.classList.add('arg-row-inline');
        }
        row.append(input, label);
      }
      left.appendChild(row);
    });
    if (!isMultiArg) {
      left.appendChild(button);
    }
    const right = document.createElement('div');
    right.classList.add('method-right');
    const consoleDiv = document.createElement('div');
    consoleDiv.classList.add('console');
    right.appendChild(consoleDiv);
    button.addEventListener('click', async () => {
      try {
        const contract = new StellarSdk.Contract(contractId);
        const convertedArgs = [];
        args.forEach(arg => {
          const value = document.getElementById(`${methodName}-${arg.name}`).value.trim();
          convertedArgs.push(toScVal(value, arg.type.toLowerCase()));
        });
        const sourceAccount = await loadSourceAccount(publicKey);
        const op = contract.call(methodName, ...convertedArgs);
        const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase,
        })
          .addOperation(op)
          .setTimeout(30)
          .build();
        const simulationResult = await rpc.simulateTransaction(tx);
        if (simulationResult.error) {
          throw new Error(simulationResult.error);
        }
        if (isReadOnlySimulation(simulationResult)) {
          const decoded = StellarSdk.scValToNative(simulationResult.result?.retval);
          const safeDecoded = JSON.parse(JSON.stringify(decoded, (key, value) =>
            typeof value === "bigint" ? value.toString() : value
          ));
          const output = typeof safeDecoded === 'string'
            ? safeDecoded
            : JSON.stringify(safeDecoded, null, 2);
          const pre = document.createElement('pre');
          pre.textContent = output;
          consoleDiv.innerHTML = '';
          consoleDiv.appendChild(pre);
        } else {
          const preparedTx = StellarSdk.rpc.assembleTransaction(tx, simulationResult).build();
          const signedTx = await signTransaction(preparedTx);
          if (!signedTx) {
            throw new Error('Transaction was not signed.');
          }
          const response = await rpc.sendTransaction(signedTx);
          const hash = response.hash;
          if (response.status === 'ERROR') {
            console.error('Transaction rejected', response);
            renderMethodConsoleError(consoleDiv, 'Transaction rejected by RPC. Check console for details.');
            return;
          }
          await pollTransactionResult(hash, methodName, consoleDiv, null);
        }
      } catch (err) {
        renderMethodConsoleError(consoleDiv, err?.message || err);
        console.error(err);
      }
    });
    wrapper.appendChild(left);
    wrapper.appendChild(right);
    container.appendChild(wrapper);
  }
}

function specTypeName(typeDef) {
  if (!typeDef || !typeDef.switch) return 'unknown';
  return typeDef.switch().name || 'unknown';
}

function isComplexSpecType(typeDef) {
  const name = specTypeName(typeDef);
  return [
    'scSpecTypeVal',
    'scSpecTypeOption',
    'scSpecTypeResult',
    'scSpecTypeVec',
    'scSpecTypeMap',
    'scSpecTypeTuple',
    'scSpecTypeBytes',
    'scSpecTypeBytesN',
    'scSpecTypeUdt',
    'scSpecTypeError',
  ].includes(name);
}

function specTypeToString(typeDef, spec, depth = 0) {
  if (!typeDef) return 'unknown';
  const name = specTypeName(typeDef);
  if (depth > 4) return '...';
  switch (name) {
    case 'scSpecTypeBool':
      return 'bool';
    case 'scSpecTypeVoid':
      return 'void';
    case 'scSpecTypeU32':
    case 'scSpecTypeI32':
    case 'scSpecTypeU64':
    case 'scSpecTypeI64':
    case 'scSpecTypeU128':
    case 'scSpecTypeI128':
    case 'scSpecTypeU256':
    case 'scSpecTypeI256':
      return name.replace('scSpecType', '').toLowerCase();
    case 'scSpecTypeString':
      return 'string';
    case 'scSpecTypeSymbol':
      return 'symbol';
    case 'scSpecTypeAddress':
      return 'address';
    case 'scSpecTypeMuxedAddress':
      return 'muxed_address';
    case 'scSpecTypeBytes':
      return 'bytes';
    case 'scSpecTypeBytesN':
      return `bytesN<${typeDef.bytesN().n()}>`;
    case 'scSpecTypeTimepoint':
      return 'timepoint';
    case 'scSpecTypeDuration':
      return 'duration';
    case 'scSpecTypeVal':
      return 'val';
    case 'scSpecTypeError':
      return 'error';
    case 'scSpecTypeOption':
      return `Option<${specTypeToString(typeDef.option().valueType(), spec, depth + 1)}>`;
    case 'scSpecTypeResult': {
      const result = typeDef.result();
      return `Result<${specTypeToString(result.okType(), spec, depth + 1)}, ${specTypeToString(result.errorType(), spec, depth + 1)}>`;
    }
    case 'scSpecTypeVec':
      return `Vec<${specTypeToString(typeDef.vec().elementType(), spec, depth + 1)}>`;
    case 'scSpecTypeMap':
      return `Map<${specTypeToString(typeDef.map().keyType(), spec, depth + 1)}, ${specTypeToString(typeDef.map().valueType(), spec, depth + 1)}>`;
    case 'scSpecTypeTuple': {
      const types = typeDef.tuple().valueTypes();
      return `(${types.map(t => specTypeToString(t, spec, depth + 1)).join(', ')})`;
    }
    case 'scSpecTypeUdt':
      return typeDef.udt().name().toString();
    default:
      return name.replace('scSpecType', '').toLowerCase();
  }
}

function specTypeHint(typeDef, spec, depth = 0) {
  if (!typeDef) return '';
  if (depth > 3) return '...';
  const name = specTypeName(typeDef);
  switch (name) {
    case 'scSpecTypeBool':
      return 'true';
    case 'scSpecTypeU32':
    case 'scSpecTypeI32':
      return '1';
    case 'scSpecTypeU64':
    case 'scSpecTypeI64':
    case 'scSpecTypeU128':
    case 'scSpecTypeI128':
    case 'scSpecTypeU256':
    case 'scSpecTypeI256':
      return '"123"';
    case 'scSpecTypeString':
      return '"hello"';
    case 'scSpecTypeSymbol':
      return '"symbol"';
    case 'scSpecTypeAddress':
      return '"G..."';
    case 'scSpecTypeMuxedAddress':
      return '"M..."';
    case 'scSpecTypeBytes':
      return '"ABC..123"';
    case 'scSpecTypeBytesN':
      return `"${'00'.repeat(typeDef.bytesN().n())}"`;
    case 'scSpecTypeTimepoint':
      return '"1700000000"';
    case 'scSpecTypeDuration':
      return '"3600"';
    case 'scSpecTypeVal':
      return '{"type":"string","value":"hello"} or xdr:...';
    case 'scSpecTypeError':
      return '{"type":"contract","code":1}';
    case 'scSpecTypeOption':
      return 'null';
    case 'scSpecTypeResult':
      return '{"ok": 1}';
    case 'scSpecTypeVec':
      return `[${specTypeHint(typeDef.vec().elementType(), spec, depth + 1)}]`;
    case 'scSpecTypeTuple':
      return `[${typeDef.tuple().valueTypes().map(t => specTypeHint(t, spec, depth + 1)).join(', ')}]`;
    case 'scSpecTypeMap':
      {
        const keyType = typeDef.map().keyType();
        const valueType = typeDef.map().valueType();
        const keyName = specTypeName(keyType);
        const valueHint = specTypeHint(valueType, spec, depth + 1);
        if ([
          'scSpecTypeString',
          'scSpecTypeSymbol',
          'scSpecTypeU32',
          'scSpecTypeI32',
          'scSpecTypeU64',
          'scSpecTypeI64',
          'scSpecTypeU128',
          'scSpecTypeI128',
          'scSpecTypeU256',
          'scSpecTypeI256',
          'scSpecTypeBool',
        ].includes(keyName)) {
          return `{ "key": ${valueHint} }`;
        }
        const keyHint = specTypeHint(keyType, spec, depth + 1);
        return `[[${keyHint}, ${valueHint}]]`;
      }
    case 'scSpecTypeUdt': {
      if (!spec || !spec.findEntry) return '{...}';
      const entry = spec.findEntry(typeDef.udt().name().toString());
      if (!entry) return '{...}';
      const kind = entry.switch().name;
      if (kind === 'scSpecEntryUdtStructV0') {
        const fields = entry.udtStructV0().fields();
        const sample = fields.map(field => {
          const fname = field.name().toString();
          const ftype = specTypeHint(field.type(), spec, depth + 1);
          return `"${fname}": ${ftype}`;
        });
        return `{ ${sample.join(', ')} }`;
      }
      if (kind === 'scSpecEntryUdtEnumV0') {
        const cases = entry.udtEnumV0().cases();
        const name = cases.length ? cases[0].name().toString() : 'Variant';
        return `"${name}"`;
      }
      if (kind === 'scSpecEntryUdtUnionV0') {
        const cases = entry.udtUnionV0().cases();
        const name = cases.length ? cases[0].value().name().toString() : 'Variant';
        return `{ "tag": "${name}", "values": [] }`;
      }
      return '{...}';
    }
    default:
      return '';
  }
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hexToBytes(hex) {
  const clean = hex.replace(/^0x/i, '').trim();
  if (clean.length % 2 !== 0) {
    throw new Error('Hex string must have an even length.');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

function parseJsonValue(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Expected JSON input. ${err.message}`);
  }
}

function parseIntegerLike(value, label) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`${label} must be an integer.`);
    }
    return value;
  }
  const str = String(value).trim();
  if (!/^-?\d+$/.test(str)) {
    throw new Error(`${label} must be an integer.`);
  }
  return BigInt(str);
}

function parseSmallInteger(value, label) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`${label} must be an integer.`);
    }
    return value;
  }
  const str = String(value).trim();
  if (!/^-?\d+$/.test(str)) {
    throw new Error(`${label} must be an integer.`);
  }
  return Number(str);
}

function parseStringValue(raw) {
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    try {
      return JSON.parse(trimmed.replace(/'/g, '"'));
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseBytesValue(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('base64:')) {
    return base64ToBytes(trimmed.slice(7));
  }
  if (trimmed.startsWith('0x') || /^[0-9a-fA-F]+$/.test(trimmed)) {
    return hexToBytes(trimmed);
  }
  if (trimmed.startsWith('[')) {
    const arr = parseJsonValue(trimmed);
    if (!Array.isArray(arr)) {
      throw new Error('Bytes JSON must be an array of numbers.');
    }
    return Uint8Array.from(arr);
  }
  return new TextEncoder().encode(trimmed);
}

function normalizeUnionInput(value) {
  if (typeof value === 'string') {
    return { tag: value };
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return { tag: value[0], values: value.slice(1) };
  }
  if (value && typeof value === 'object') {
    if (value.tag) {
      return value;
    }
    const keys = Object.keys(value);
    if (keys.length === 1) {
      const tag = keys[0];
      const inner = value[tag];
      return {
        tag,
        values: Array.isArray(inner) ? inner : (typeof inner === 'undefined' ? [] : [inner]),
      };
    }
  }
  throw new Error('Union input must be a tag string or JSON object with a tag/values.');
}

function buildResultScVal(value, resultTypeDef, spec) {
  const resultDef = resultTypeDef.result();
  const okType = resultDef.okType();
  const errType = resultDef.errorType();
  let tag;
  let inner;
  if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'string') {
    tag = value[0].toLowerCase();
    inner = value[1];
  } else if (value && typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'ok')) {
      tag = 'ok';
      inner = value.ok;
    } else if (Object.prototype.hasOwnProperty.call(value, 'err')) {
      tag = 'err';
      inner = value.err;
    } else if (value.tag) {
      tag = value.tag.toLowerCase();
      inner = value.value;
    }
  } else if (typeof value === 'string') {
    tag = value.toLowerCase();
  }
  if (tag !== 'ok' && tag !== 'err') {
    throw new Error('Result input must be JSON like {"ok": ...} or {"err": ...}.');
  }
  const symbol = StellarSdk.xdr.ScVal.scvSymbol(tag);
  if (typeof inner === 'undefined') {
    throw new Error(`Result ${tag} requires a value.`);
  }
  const normalized = normalizeSpecValue(inner, tag === 'ok' ? okType : errType, spec);
  const innerVal = spec.nativeToScVal(normalized, tag === 'ok' ? okType : errType);
  return StellarSdk.xdr.ScVal.scvVec([symbol, innerVal]);
}

function buildErrorScVal(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Error input must be a JSON object.');
  }
  const type = (value.type || 'contract').toString().toLowerCase();
  const code = value.code;
  if (type === 'contract') {
    const num = Number(code);
    if (!Number.isFinite(num)) {
      throw new Error('Contract error code must be a number.');
    }
    return StellarSdk.xdr.ScVal.scvError(StellarSdk.xdr.ScError.sceContract(num));
  }
  const toScErrorCode = (val) => {
    if (typeof val === 'number') {
      return StellarSdk.xdr.ScErrorCode._byValue[val];
    }
    if (typeof val === 'string') {
      if (/^\d+$/.test(val)) {
        return StellarSdk.xdr.ScErrorCode._byValue[Number(val)];
      }
      const fn = StellarSdk.xdr.ScErrorCode[val];
      if (typeof fn === 'function') {
        return fn();
      }
    }
    return null;
  };
  const scCode = toScErrorCode(code);
  if (!scCode) {
    throw new Error('Invalid ScErrorCode. Use a numeric code or enum name like \"scecInvalidInput\".');
  }
  const typeMap = {
    wasmvm: 'sceWasmVm',
    context: 'sceContext',
    storage: 'sceStorage',
    object: 'sceObject',
    crypto: 'sceCrypto',
    events: 'sceEvents',
    budget: 'sceBudget',
    value: 'sceValue',
    auth: 'sceAuth',
  };
  const method = typeMap[type];
  if (!method || typeof StellarSdk.xdr.ScError[method] !== 'function') {
    throw new Error(`Unsupported error type: ${type}`);
  }
  return StellarSdk.xdr.ScVal.scvError(StellarSdk.xdr.ScError[method](scCode));
}

function normalizeSpecValue(value, typeDef, spec, depth = 0) {
  if (depth > 6) return value;
  if (value instanceof StellarSdk.xdr.ScVal) return value;
  if (typeof value === 'string' && value.trim().toLowerCase().startsWith('xdr:')) {
    return StellarSdk.xdr.ScVal.fromXDR(value.trim().slice(4), 'base64');
  }
  const name = specTypeName(typeDef);
  switch (name) {
    case 'scSpecTypeOption':
      if (value === null || typeof value === 'undefined') return undefined;
      return normalizeSpecValue(value, typeDef.option().valueType(), spec, depth + 1);
    case 'scSpecTypeBool':
      if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true') return true;
        if (lower === 'false') return false;
      }
      return value;
    case 'scSpecTypeU32':
    case 'scSpecTypeI32':
      return parseSmallInteger(value, specTypeToString(typeDef, spec));
    case 'scSpecTypeBytes':
    case 'scSpecTypeBytesN': {
      if (value instanceof Uint8Array) return value;
      if (Array.isArray(value)) return Uint8Array.from(value);
      if (typeof value === 'string') return parseBytesValue(value);
      return value;
    }
    case 'scSpecTypeTimepoint': {
      return StellarSdk.xdr.ScVal.scvTimepoint(parseIntegerLike(value, 'Timepoint'));
    }
    case 'scSpecTypeDuration': {
      return StellarSdk.xdr.ScVal.scvDuration(parseIntegerLike(value, 'Duration'));
    }
    case 'scSpecTypeMuxedAddress': {
      if (typeof value !== 'string') return value;
      const muxed = StellarSdk.decodeAddressToMuxedAccount(value);
      return StellarSdk.xdr.ScVal.scvAddress(
        StellarSdk.xdr.ScAddress.scAddressTypeMuxedAccount(muxed)
      );
    }
    case 'scSpecTypeVal': {
      if (value && typeof value === 'object' && value.type) {
        const type = String(value.type).toLowerCase();
        if (type === 'timepoint') {
          return StellarSdk.xdr.ScVal.scvTimepoint(parseIntegerLike(value.value, 'Timepoint'));
        }
        if (type === 'duration') {
          return StellarSdk.xdr.ScVal.scvDuration(parseIntegerLike(value.value, 'Duration'));
        }
        if (type === 'bytes') {
          const bytes = value.value instanceof Uint8Array
            ? value.value
            : Array.isArray(value.value)
              ? Uint8Array.from(value.value)
              : parseBytesValue(String(value.value));
          return StellarSdk.nativeToScVal(bytes, { type: 'bytes' });
        }
        return StellarSdk.nativeToScVal(value.value, { type: value.type });
      }
      return StellarSdk.nativeToScVal(value);
    }
    case 'scSpecTypeError':
      return buildErrorScVal(value);
    case 'scSpecTypeVec': {
      if (!Array.isArray(value)) {
        throw new Error('Vec input must be a JSON array.');
      }
      const elementType = typeDef.vec().elementType();
      return value.map(item => normalizeSpecValue(item, elementType, spec, depth + 1));
    }
    case 'scSpecTypeTuple': {
      if (!Array.isArray(value)) {
        throw new Error('Tuple input must be a JSON array.');
      }
      const types = typeDef.tuple().valueTypes();
      if (value.length !== types.length) {
        throw new Error(`Tuple expects ${types.length} values, but ${value.length} were provided.`);
      }
      return value.map((item, idx) => normalizeSpecValue(item, types[idx], spec, depth + 1));
    }
    case 'scSpecTypeMap': {
      const keyType = typeDef.map().keyType();
      const valueType = typeDef.map().valueType();
      let entries;
      if (Array.isArray(value)) {
        entries = value;
      } else if (value instanceof Map) {
        entries = Array.from(value.entries());
      } else if (value && typeof value === 'object') {
        entries = Object.entries(value);
      } else {
        throw new Error('Map input must be a JSON object or array of [key, value] pairs.');
      }
      return entries.map((entry) => {
        if (!Array.isArray(entry) || entry.length !== 2) {
          throw new Error('Map entries must be [key, value] pairs.');
        }
        const [k, v] = entry;
        return [
          normalizeSpecValue(k, keyType, spec, depth + 1),
          normalizeSpecValue(v, valueType, spec, depth + 1),
        ];
      });
    }
    case 'scSpecTypeUdt': {
      const entry = spec.findEntry(typeDef.udt().name().toString());
      if (!entry) return value;
      const kind = entry.switch().name;
      if (kind === 'scSpecEntryUdtEnumV0') {
        if (typeof value === 'number') return value;
        if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
        const cases = entry.udtEnumV0().cases();
        const match = cases.find(c => c.name().toString() === value || c.name().toString().toLowerCase() === String(value).toLowerCase());
        if (!match) {
          throw new Error(`Unknown enum case: ${value}`);
        }
        return match.value();
      }
      if (kind === 'scSpecEntryUdtStructV0') {
        const fields = entry.udtStructV0().fields();
        const fieldNames = fields.map(field => field.name().toString());
        const numericFields = fieldNames.every(name => /^\d+$/.test(name));
        if (Array.isArray(value)) {
          if (!numericFields) {
            throw new Error('Struct input must be a JSON object with named fields.');
          }
          if (value.length !== fields.length) {
            throw new Error(`Struct expects ${fields.length} values, but ${value.length} were provided.`);
          }
          return value.map((item, idx) => normalizeSpecValue(item, fields[idx].type(), spec, depth + 1));
        }
        if (!value || typeof value !== 'object') {
          throw new Error('Struct input must be a JSON object with named fields.');
        }
        const normalized = {};
        fields.forEach(field => {
          const fname = field.name().toString();
          if (!Object.prototype.hasOwnProperty.call(value, fname)) return;
          normalized[fname] = normalizeSpecValue(value[fname], field.type(), spec, depth + 1);
        });
        return normalized;
      }
      if (kind === 'scSpecEntryUdtUnionV0') {
        const normalized = normalizeUnionInput(value);
        const cases = entry.udtUnionV0().cases();
        const unionCase = cases.find(c => c.value().name().toString() === normalized.tag);
        if (!unionCase) {
          throw new Error(`Unknown union case: ${normalized.tag}`);
        }
        if (unionCase.switch() === StellarSdk.xdr.ScSpecUdtUnionCaseV0Kind.scSpecUdtUnionCaseVoidV0()) {
          return { tag: normalized.tag };
        }
        const tupleTypes = unionCase.tupleCase().type();
        const values = Array.isArray(normalized.values) ? normalized.values : [];
        if (values.length !== tupleTypes.length) {
          throw new Error(`Union ${normalized.tag} expects ${tupleTypes.length} values, but ${values.length} were provided.`);
        }
        return {
          tag: normalized.tag,
          values: values.map((item, idx) => normalizeSpecValue(item, tupleTypes[idx], spec, depth + 1)),
        };
      }
      return value;
    }
    default:
      return value;
  }
}

function parseInputValue(raw, typeDef, spec) {
  const trimmed = raw.trim();
  const name = specTypeName(typeDef);
  if (trimmed === '') {
    if (name === 'scSpecTypeOption') {
      return undefined;
    }
    throw new Error('Argument value is required.');
  }
  if (trimmed.toLowerCase().startsWith('xdr:')) {
    return StellarSdk.xdr.ScVal.fromXDR(trimmed.slice(4).trim(), 'base64');
  }
  if (name === 'scSpecTypeBool') {
    const lower = trimmed.toLowerCase();
    if (lower === 'true' || lower === 'false') {
      return lower === 'true';
    }
    return parseJsonValue(trimmed);
  }
  if (name === 'scSpecTypeString' || name === 'scSpecTypeSymbol' || name === 'scSpecTypeAddress') {
    return parseStringValue(trimmed);
  }
  if (name === 'scSpecTypeMuxedAddress') {
    const addr = parseStringValue(trimmed);
    const muxed = StellarSdk.decodeAddressToMuxedAccount(addr);
    return StellarSdk.xdr.ScVal.scvAddress(
      StellarSdk.xdr.ScAddress.scAddressTypeMuxedAccount(muxed)
    );
  }
  if (name === 'scSpecTypeBytes' || name === 'scSpecTypeBytesN') {
    const bytes = parseBytesValue(trimmed);
    if (name === 'scSpecTypeBytesN') {
      const expected = typeDef.bytesN().n();
      if (bytes.length !== expected) {
        throw new Error(`Expected ${expected} bytes, got ${bytes.length}.`);
      }
    }
    return bytes;
  }
  if (name === 'scSpecTypeU32' || name === 'scSpecTypeI32') {
    return parseSmallInteger(trimmed, specTypeToString(typeDef, spec));
  }
  if ([
    'scSpecTypeU64',
    'scSpecTypeI64',
    'scSpecTypeU128',
    'scSpecTypeI128',
    'scSpecTypeU256',
    'scSpecTypeI256',
  ].includes(name)) {
    return trimmed;
  }
  if (name === 'scSpecTypeTimepoint') {
    const value = trimmed.startsWith('"') ? parseStringValue(trimmed) : trimmed;
    return StellarSdk.xdr.ScVal.scvTimepoint(parseIntegerLike(value, 'Timepoint'));
  }
  if (name === 'scSpecTypeDuration') {
    const value = trimmed.startsWith('"') ? parseStringValue(trimmed) : trimmed;
    return StellarSdk.xdr.ScVal.scvDuration(parseIntegerLike(value, 'Duration'));
  }
  if (name === 'scSpecTypeOption') {
    if (trimmed.toLowerCase() === 'null') return undefined;
    return parseInputValue(trimmed, typeDef.option().valueType(), spec);
  }
  if (name === 'scSpecTypeVal') {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = parseStringValue(trimmed);
    }
    if (parsed && typeof parsed === 'object' && parsed.type) {
      const type = String(parsed.type).toLowerCase();
      if (type === 'timepoint') {
        return StellarSdk.xdr.ScVal.scvTimepoint(parseIntegerLike(parsed.value, 'Timepoint'));
      }
      if (type === 'duration') {
        return StellarSdk.xdr.ScVal.scvDuration(parseIntegerLike(parsed.value, 'Duration'));
      }
      if (type === 'bytes') {
        const bytes = parsed.value instanceof Uint8Array
          ? parsed.value
          : Array.isArray(parsed.value)
            ? Uint8Array.from(parsed.value)
            : parseBytesValue(String(parsed.value));
        return StellarSdk.nativeToScVal(bytes, { type: 'bytes' });
      }
      return StellarSdk.nativeToScVal(parsed.value, { type: parsed.type });
    }
    return StellarSdk.nativeToScVal(parsed);
  }
  if (name === 'scSpecTypeError') {
    const parsed = parseJsonValue(trimmed);
    return buildErrorScVal(parsed);
  }
  if (name === 'scSpecTypeResult') {
    const parsed = parseJsonValue(trimmed);
    return buildResultScVal(parsed, typeDef, spec);
  }
  if (name === 'scSpecTypeVec' || name === 'scSpecTypeTuple' || name === 'scSpecTypeMap') {
    const parsed = parseJsonValue(trimmed);
    return normalizeSpecValue(parsed, typeDef, spec);
  }
  if (name === 'scSpecTypeUdt') {
    const parsed = (trimmed.startsWith('{') || trimmed.startsWith('[')) ? parseJsonValue(trimmed) : parseStringValue(trimmed);
    return normalizeSpecValue(parsed, typeDef, spec);
  }
  if (name === 'scSpecTypeVoid') {
    return null;
  }
  return parseJsonValue(trimmed);
}

function safeSerialize(value) {
  const seen = new WeakSet();
  const json = JSON.stringify(value, (key, val) => {
    if (typeof val === "bigint") return val.toString();
    if (val && typeof val === "object") {
      if (seen.has(val)) return "[Circular]";
      seen.add(val);
    }
    if (val instanceof Uint8Array) return Array.from(val);
    if (val instanceof Map) return Object.fromEntries(val.entries());
    if (val instanceof StellarSdk.contract.Ok) {
      return { ok: val.value ?? val };
    }
    if (val instanceof StellarSdk.contract.Err) {
      return { err: val.error ?? val };
    }
    return val;
  });
  return JSON.parse(json);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isReadOnlySimulation(simulationResult) {
  const authCount = simulationResult?.result?.auth?.length ?? 0;
  const txData = simulationResult?.transactionData;
  let writeCount = 0;
  if (txData) {
    if (typeof txData.getReadWrite === 'function') {
      writeCount = txData.getReadWrite().length;
    } else if (typeof txData.getFootprint === 'function') {
      const fp = txData.getFootprint();
      if (typeof fp?.readWrite === 'function') {
        writeCount = fp.readWrite().length;
      }
    } else {
      const readWrite = txData
        ?.resources?.()
        ?.footprint?.()
        ?.readWrite?.();
      if (readWrite?.length != null) {
        writeCount = readWrite.length;
      }
    }
  }
  return authCount === 0 && writeCount === 0;
}

function formatReturnValues(methodName, returnValue, spec) {
  if (!returnValue) return null;
  const decoded = spec
    ? spec.funcResToNative(methodName, returnValue)
    : StellarSdk.scValToNative(returnValue);
  const safeDecoded = spec ? safeSerialize(decoded) : JSON.parse(
    JSON.stringify(decoded, (key, value) => typeof value === "bigint" ? value.toString() : value)
  );
  const normalizeValue = (value) => {
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  };
  if (Array.isArray(safeDecoded)) {
    return safeDecoded.length ? safeDecoded.map(normalizeValue) : ['[]'];
  }
  return [normalizeValue(safeDecoded)];
}

function getExplorerBaseUrl() {
  if (network === 'LOCAL') {
    return null;
  }
  return `https://stellar.expert/explorer/${network.toLowerCase()}`;
}

function createTxExplorerNode(hash, className = '') {
  const explorerBase = getExplorerBaseUrl();
  if (!explorerBase) {
    const code = document.createElement('code');
    code.textContent = hash;
    return code;
  }
  const link = document.createElement('a');
  if (className) link.className = className;
  link.href = `${explorerBase}/tx/${hash}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = hash;
  return link;
}

function renderMethodConsoleError(consoleDiv, error) {
  const pre = document.createElement('pre');
  pre.style.color = 'var(--danger-color)';
  pre.textContent = String(error || 'Unknown error');
  consoleDiv.replaceChildren(pre);
}

function contractExplorerMarkup(contractAddress) {
  const explorerBase = getExplorerBaseUrl();
  if (!explorerBase) {
    return 'Block Explorer: Not available for local/custom network.<br />';
  }
  return `Block Explorer: <a href="${explorerBase}/contract/${contractAddress}" target="_blank">Stellar.Expert</a><br />`;
}

async function pollTransactionResult(hash, methodName, consoleDiv, spec) {
  const pending = document.createElement('div');
  pending.textContent = 'Transaction Submitted (PENDING). Waiting for confirmation...';
  consoleDiv.replaceChildren(pending, createTxExplorerNode(hash));
  while (true) {
    const tx = await rpc.getTransaction(hash);
    if (tx.status === 'NOT_FOUND') {
      await sleep(2000);
      continue;
    }
    if (tx.status === 'FAILED') {
      const failed = document.createElement('div');
      failed.style.color = 'var(--danger-color)';
      failed.textContent = 'Transaction FAILED.';
      consoleDiv.replaceChildren(failed, createTxExplorerNode(hash));
      return;
    }
    if (tx.status === 'SUCCESS') {
      const outputs = formatReturnValues(methodName, tx.returnValue, spec);
      const success = document.createElement('div');
      success.textContent = 'Success TX: ';
      success.appendChild(createTxExplorerNode(hash, 'tx-hash-link'));
      if (outputs !== null) {
        const pre = document.createElement('pre');
        pre.textContent = outputs.join('\n');
        const label = document.createElement('div');
        label.className = 'tx-output-label';
        label.textContent = 'Output:';
        consoleDiv.replaceChildren(success, label, pre);
      } else {
        const label = document.createElement('div');
        label.className = 'tx-output-label';
        label.textContent = 'Output: No return value.';
        consoleDiv.replaceChildren(success, label);
      }
      return;
    }
    await sleep(2000);
  }
}

async function getContractSpec(contractId) {
  const cacheKey = `${network}:${contractId}`;
  if (contractSpecCache.has(cacheKey)) {
    return contractSpecCache.get(cacheKey);
  }
  const client = await StellarSdk.contract.Client.from({
    contractId,
    rpcUrl,
    networkPassphrase,
    allowHttp: shouldAllowHttp(rpcUrl),
  });
  const spec = client.spec;
  contractSpecCache.set(cacheKey, spec);
  return spec;
}

function renderContractFormFromSpec(contractId, spec, divId = 'explore-form') {
  const container = document.getElementById(divId);
  container.innerHTML = '';
  const funcs = spec.funcs();
  funcs.forEach(fn => {
    const methodName = fn.name().toString();
    const inputs = fn.inputs();
    const args = inputs.map(input => {
      return {
        name: input.name().toString(),
        typeDef: input.type(),
        doc: input.doc ? input.doc().toString() : '',
      };
    });
    const wrapper = document.createElement('div');
    wrapper.classList.add('method-box');
    const isMultiArg = args.length > 1;
    if (args.length <= 1) {
      wrapper.classList.add('method-compact');
    }
    if (args.length === 0) {
      wrapper.classList.add('method-no-args');
    }
    if (isMultiArg) {
      wrapper.classList.add('method-multi');
    }
    const left = document.createElement('div');
    left.classList.add('method-left');
    const title = document.createElement('h3');
    title.textContent = methodName;
    const button = document.createElement('button');
    button.classList.add('method-call-button');
    button.innerHTML = '<i class="fas fa-paper-plane"></i>';
    button.setAttribute('aria-label', `Call ${methodName}`);
    button.setAttribute('title', `Call ${methodName}`);
    if (!isMultiArg) {
      left.appendChild(title);
    }
    args.forEach((arg, index) => {
      const row = document.createElement('div');
      row.classList.add('arg-row');
      const label = document.createElement('label');
      const typeLabel = specTypeToString(arg.typeDef, spec);
      label.textContent = `${arg.name}:${typeLabel}`;
      label.classList.add('arg-label');
      label.htmlFor = `${methodName}-${arg.name}`;
      const isComplex = isComplexSpecType(arg.typeDef);
      const input = document.createElement(isComplex ? 'textarea' : 'input');
      if (!isComplex) {
        input.type = 'text';
      } else {
        input.rows = 2;
      }
      input.id = `${methodName}-${arg.name}`;
      const hint = specTypeHint(arg.typeDef, spec);
      input.placeholder = hint ? `${arg.name}:${typeLabel} e.g. ${hint}` : `${arg.name}:${typeLabel}`;
      const docHint = arg.doc ? ` ${arg.doc}` : '';
      input.setAttribute('title', `${typeLabel}${docHint} (JSON for complex types)`);
      input.setAttribute('aria-label', `${arg.name}: ${typeLabel}`);
      if (isMultiArg) {
        row.classList.add('arg-row-multi');
        const titleCell = document.createElement('div');
        titleCell.classList.add('method-title-cell');
        if (index === 0) {
          titleCell.appendChild(title);
        } else {
          const spacer = document.createElement('span');
          spacer.classList.add('method-title-spacer');
          titleCell.appendChild(spacer);
        }
        const fieldCell = document.createElement('div');
        fieldCell.classList.add('method-field-cell');
        fieldCell.append(input, label);
        if (index === args.length - 1) {
          fieldCell.appendChild(button);
        }
        row.append(titleCell, fieldCell);
      } else {
        if (args.length <= 1) {
          row.classList.add('arg-row-inline');
        }
        row.append(input, label);
      }
      left.appendChild(row);
    });
    if (!isMultiArg) {
      left.appendChild(button);
    }
    const right = document.createElement('div');
    right.classList.add('method-right');
    const consoleDiv = document.createElement('div');
    consoleDiv.classList.add('console');
    right.appendChild(consoleDiv);
    button.addEventListener('click', async () => {
      try {
        const contract = new StellarSdk.Contract(contractId);
        const argsObj = {};
        args.forEach(arg => {
          const inputEl = document.getElementById(`${methodName}-${arg.name}`);
          const value = parseInputValue(inputEl.value, arg.typeDef, spec);
          argsObj[arg.name] = value;
        });
        const convertedArgs = spec.funcArgsToScVals(methodName, argsObj);
        const sourceAccount = await loadSourceAccount(publicKey);
        const op = contract.call(methodName, ...convertedArgs);
        const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase,
        })
          .addOperation(op)
          .setTimeout(30)
          .build();
        const simulationResult = await rpc.simulateTransaction(tx);
        if (simulationResult.error) {
          throw new Error(simulationResult.error);
        }
        if (isReadOnlySimulation(simulationResult)) {
          const decoded = spec.funcResToNative(methodName, simulationResult.result?.retval);
          const safeDecoded = safeSerialize(decoded);
          const output = typeof safeDecoded === 'string'
            ? safeDecoded
            : JSON.stringify(safeDecoded, null, 2);
          const pre = document.createElement('pre');
          pre.textContent = output;
          consoleDiv.innerHTML = '';
          consoleDiv.appendChild(pre);
        } else {
          const preparedTx = StellarSdk.rpc.assembleTransaction(tx, simulationResult).build();
          const signedTx = await signTransaction(preparedTx);
          if (!signedTx) {
            throw new Error('Transaction was not signed.');
          }
          const response = await rpc.sendTransaction(signedTx);
          const hash = response.hash;
          if (response.status === 'ERROR') {
            console.error('Transaction rejected', response);
            renderMethodConsoleError(consoleDiv, 'Transaction rejected by RPC. Check console for details.');
            return;
          }
          await pollTransactionResult(hash, methodName, consoleDiv, spec);
        }
      } catch (err) {
        renderMethodConsoleError(consoleDiv, err?.message || err);
        console.error(err);
      }
    });
    wrapper.appendChild(left);
    wrapper.appendChild(right);
    container.appendChild(wrapper);
  });
}


function activatePanel(panelId, options = {}) {
  const { splitRatio = null, resetSplit = false, expandPanel = true } = options;
  const panelEl = document.getElementById(panelId);
  if (!panelEl) return;

  if (expandPanel) {
    const shouldRestore = splitRatio === null && !resetSplit;
    setPanelCollapsed(false, { restoreRatio: shouldRestore });
  }

  document.querySelectorAll('.sidebar-icon').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

  panelEl.classList.add('active');
  const panelKey = panelId.replace('-panel', '');
  const sidebarIcon = document.querySelector(`.sidebar-icon[data-panel="${panelKey}"]`);
  if (sidebarIcon) sidebarIcon.classList.add('active');

  if (resetSplit) resetPanelSplit();
  if (splitRatio !== null) applyPanelSplit(splitRatio, { captureDefault: true });
}

async function loadContract(contractId) {
  activatePanel('explore-panel', { splitRatio: 0.25 });
  const exploreForm = document.getElementById('explore-form');
  document.getElementById('explore-contract-id').value = contractId;
  // Save to local storage
  localStorage.setItem('last-contract-id', contractId);
  persistNetworkSelection(network);
  try {
    exploreForm.innerText = 'Loading contract interface...';
    if (network === 'LOCAL') {
      const spec = await getContractSpec(contractId);
      renderContractFormFromSpec(contractId, spec);
      return;
    }
    const interfacePromise = fetch('/interface', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contract: contractId, network: network.toLowerCase() })
    }).then(response => response.text());
    const specPromise = getContractSpec(contractId);
    const [specResult, interfaceResult] = await Promise.allSettled([specPromise, interfacePromise]);
    if (specResult.status === 'fulfilled') {
      renderContractFormFromSpec(contractId, specResult.value);
      return;
    }
    if (interfaceResult.status === 'fulfilled') {
      renderContractForm(contractId, interfaceResult.value);
      return;
    }
    throw specResult.reason || interfaceResult.reason;
  } catch (err) {
    exploreForm.innerText = `Failed to load contract: ${err.message}`;
    console.error(err);
  }
}

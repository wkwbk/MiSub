import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseSurgeConfig } from '@misub/core/protocols/surge-parser.js';
import { parseQuantumultXConfig } from '@misub/core/protocols/quantumultx-parser.js';
import { extractValidNodes } from '@misub/core/node/node-parser.js';

function collectJsFiles(dir, result = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      collectJsFiles(fullPath, result);
    } else if (fullPath.endsWith('.js')) {
      result.push(fullPath);
    }
  }
  return result;
}

function stripJsComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

describe('@misub/core package purity and unified protocol parsers', () => {
  test('packages/core/src has zero DOM, Node built-in, Buffer, or Cloudflare binding dependencies', () => {
    const coreSrcDir = path.resolve(process.cwd(), 'packages/core/src');
    const files = collectJsFiles(coreSrcDir);
    expect(files.length).toBeGreaterThan(20);

    const forbiddenPatterns = [
      /\bwindow\./,
      /\bdocument\./,
      /\blocalStorage\b/,
      /\bsessionStorage\b/,
      /\bBuffer\b/,
      /['"]node:/,
      /['"]cloudflare:/,
      /\bcaches\.default\b/,
      /\.\.\/\.\.\/\.\.\//,
    ];

    for (const filePath of files) {
      const content = stripJsComments(readFileSync(filePath, 'utf-8'));
      for (const pattern of forbiddenPatterns) {
        expect(
          pattern.test(content),
          `${path.relative(coreSrcDir, filePath)} matched forbidden pattern ${pattern}`,
        ).toBe(false);
      }
    }
  });

  test('unified parseSurgeConfig handles both KV and positional SS, tuic-v5, and snell', () => {
    const surgeText = [
      'SS_KV = ss, 1.2.3.4, 8388, encrypt-method=aes-256-gcm, password=secret-kv',
      'SS_Positional = ss, 1.2.3.5, 8389, chacha20-ietf-poly1305, secret-pos',
      'TUIC_V5 = tuic-v5, tuic.example.com, 443, uuid=11111111-1111-1111-1111-111111111111, password=tuic-pass, sni=tuic.example.com',
      'Snell_V4 = snell, snell.example.com, 6160, psk=snell-psk, version=4',
    ].join('\n');

    const nodes = parseSurgeConfig(surgeText);
    expect(nodes).toHaveLength(4);
    expect(nodes.map((n) => n.protocol)).toEqual(['ss', 'ss', 'tuic', 'snell']);
    expect(nodes[0].url).toContain('1.2.3.4:8388');
    expect(nodes[1].url).toContain('1.2.3.5:8389');
    expect(nodes[2].url).toContain('tuic://');
    expect(nodes[3].url).toContain('snell://');

    const extracted = extractValidNodes(surgeText);
    expect(extracted).toHaveLength(4);
    expect(extracted[0]).toMatch(/^ss:\/\//);
    expect(extracted[2]).toMatch(/^tuic:\/\//);
    expect(extracted[3]).toMatch(/^snell:\/\//);
  });

  test('unified parseQuantumultXConfig handles vless reality with x25519mlkem768', () => {
    const qxText =
      'vless=vless.example.com:443, method=none, password=22222222-2222-2222-2222-222222222222, obfs=over-tls, obfs-host=cdn.example.com, reality-base64-pubkey=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefg, reality-hex-shortid=01ab, support-x25519mlkem768=true, tag=VLESS-PQ';

    const nodes = parseQuantumultXConfig(qxText);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].protocol).toBe('vless');
    expect(nodes[0].name).toBe('VLESS-PQ');
    expect(nodes[0].url).toContain('security=reality');
    expect(nodes[0].url).toContain('pbk=');
    expect(nodes[0].url).toContain('sid=01ab');

    const extracted = extractValidNodes(qxText);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toMatch(/^vless:\/\//);
  });
});

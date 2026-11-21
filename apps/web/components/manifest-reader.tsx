'use client';
import { useState } from 'react';
import { verifyManifest, type ManifestVerification } from '@premortem/core';
import type { Hex } from 'viem';
import { REGISTRY } from '../lib/config';
import { Notice, Raw } from './ui';
import { FutureTree } from './future-tree';
export function ManifestReader({
  capsule,
}: {
  capsule: { creator: string; actionHash: Hex; evidenceRoot: Hex; simulationHash: Hex };
}) {
  const [result, setResult] = useState<ManifestVerification>();
  const [error, setError] = useState('');
  return (
    <section className="panel">
      <h2>Verify the author's manifest</h2>
      <p>
        Open the exported manifest locally. We recompute the deterministic findings and compare all
        three hashes with this capsule. Your file is not uploaded. Matching hashes establish
        integrity, while RPC claims and external assumptions still need independent scrutiny.
      </p>
      <label>
        Action manifest JSON
        <input
          type="file"
          accept="application/json"
          onChange={async (e) => {
            setError('');
            setResult(undefined);
            try {
              const file = e.target.files?.[0];
              if (!file || !REGISTRY) return;
              if (file.size > 1000000) throw new Error('Manifest exceeds 1 MB');
              setResult(
                verifyManifest(JSON.parse(await file.text()), {
                  registry: REGISTRY,
                  creator: capsule.creator,
                  expected: {
                    actionHash: capsule.actionHash,
                    evidenceRoot: capsule.evidenceRoot,
                    simulationHash: capsule.simulationHash,
                  },
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      {result && (
        <>
          <Notice tone={result.verified ? 'neutral' : 'error'}>
            {result.verified
              ? 'Manifest integrity matches the anchored capsule. This does not prove safety.'
              : result.errors.join(' ')}
          </Notice>
          <Raw
            value={{ checks: result.checks, computed: result.computed, limits: result.limitations }}
            label="Manifest validation evidence"
          />
          {result.verified && result.manifest && <FutureTree findings={result.manifest.findings} />}
        </>
      )}
    </section>
  );
}

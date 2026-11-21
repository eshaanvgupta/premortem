'use client';
import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { Finding } from '@premortem/core';
import { Raw } from './ui';
export function FutureTree({ findings }: { findings: Finding[] }) {
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState(0);
  if (!findings.length) return null;
  const selectedFinding = findings[selected] ?? findings[0];
  return (
    <section className="tree-section">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">EVIDENCE GRAPH</span>
          <h2>The Future Tree</h2>
        </div>
        <span className="tag">PROBABILITY UNAVAILABLE</span>
      </div>
      <div className="tree-layout">
        <div className="tree" role="group" aria-label="Evidence branches">
          <svg
            viewBox={`0 0 500 ${findings.length * 65 + 50}`}
            aria-hidden="true"
            preserveAspectRatio="none"
          >
            {findings.map((f, i) => (
              <path
                key={f.id}
                className={f.severity}
                d={`M 20 25 C 125 25 120 ${i * 65 + 40} 210 ${i * 65 + 40}`}
              />
            ))}
          </svg>
          <span className="tree-origin" />
          <div className="tree-branches">
            {findings.map((f, i) => (
              <button
                key={f.id}
                className={`tree-node ${f.severity} ${selected === i ? 'selected' : ''}`}
                onClick={() => setSelected(i)}
                aria-pressed={selected === i}
              >
                <span className="node-symbol" />
                <span>{f.observed}</span>
                <small>{f.severity.toUpperCase()}</small>
              </button>
            ))}
          </div>
        </div>
        <motion.aside
          className="tree-detail"
          animate={{ opacity: 1 }}
          initial={false}
          transition={{ duration: reduced ? 0 : 0.2 }}
          key={selectedFinding.id}
        >
          <span className={`severity ${selectedFinding.severity}`}>
            {selectedFinding.severity.toUpperCase()}
          </span>
          <h3>{selectedFinding.observed}</h3>
          <dl>
            <dt>Source</dt>
            <dd>{selectedFinding.source}</dd>
            <dt>Rule</dt>
            <dd>{selectedFinding.ruleVersion}</dd>
            <dt>Confidence in observation</dt>
            <dd>{selectedFinding.confidence}</dd>
            <dt>Probability of outcome</dt>
            <dd>UNAVAILABLE</dd>
          </dl>
          {selectedFinding.limitations.map((l) => (
            <p key={l} className="fine">
              {l}
            </p>
          ))}
          <Raw value={selectedFinding.evidence} label="Inspect source evidence" />
        </motion.aside>
      </div>
    </section>
  );
}

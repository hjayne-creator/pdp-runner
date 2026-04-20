import type { ProductWorkflow } from '../api/types';

/** How the user chose to leave Home for the Runner (hybrid flow). */
export type HomeToRunnerIntent = 'review_and_run' | 'customize_first';

/** Passed from Home → Runner via react-router location.state. */
export interface RunnerPrefillState {
  fromHome?: boolean;
  /** Set when navigating from Home; defaults to customize_first if omitted. */
  homeIntent?: HomeToRunnerIntent;
  inputUrl?: string;
  workflow?: ProductWorkflow;
  reportTypeId?: string;
  modelId?: string;
  /** Optional override of the report type's default prompt. */
  promptId?: string;
  /** Optional override of the report type's verify_competitors flag. */
  verifyCompetitors?: boolean;
}

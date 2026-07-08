export interface GeneratedTestCaseStep {
  action: string;
  expected?: string;
}

export interface GeneratedTestCase {
  title: string;
  type: 'UI' | 'API';
  preconditions?: string;
  steps: GeneratedTestCaseStep[];
  expectedResult: string;
}

export interface AIProvider {
  /**
   * Generates test cases based on the provided requirement text.
   * Should throw an error if the generation times out or fails.
   */
  generateTestCases(requirementText: string): Promise<GeneratedTestCase[]>;
}

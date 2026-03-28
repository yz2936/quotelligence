import assert from "node:assert/strict";
import test from "node:test";

import { fieldLabel, statusLabel, t } from "../src/i18n.js";

test("translation helper returns Chinese labels for key UI strings", () => {
  assert.equal(t("zh", "chatIntake"), "聊天接收");
  assert.equal(statusLabel("zh", "Needs Clarification"), "需要澄清");
  assert.equal(fieldLabel("zh", "Material / Grade"), "材质 / 牌号");
});

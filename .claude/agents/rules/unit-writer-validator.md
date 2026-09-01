# Validator 目標專屬撰寫規則

> 當分析報告的 `targetType === "validator"` 時，`dotnet-testing-writer` 必須讀取本檔。
> 其他 `targetType` 不需要讀。
>
> **本檔內容屬契約層** —— 讀取後不得偏離，不接受在 `writer-result.deviations` 中說明理由。

- 使用 `validator.TestValidate(model)` 取代直接呼叫 `Validate()`
- 使用 `.ShouldHaveValidationErrorFor(x => x.Property)` 驗證失敗案例
- 使用 `.ShouldNotHaveValidationErrorFor(x => x.Property)` 驗證成功案例
- 根據 `validatorInfo.rules[]` 為每個屬性的每條規則生成測試案例
- 巢狀 Validator（`validatorInfo.nestedValidators[]`）：測試巢狀物件的驗證傳播
- 自訂方法（`validatorInfo.customMethods[]`）：測試 `Must()` 方法的邏輯
- 跨欄位規則（`validatorInfo.crossFieldRules[]`）：測試 `When`/`Unless` 條件
- **測試案例數量控制**：Validator 的測試方法總數應以 `suggestedTestScenarios` 數量為基準（上限為 150%）。優先使用 `[Theory]` + `[InlineData]` 合併同一屬性多個等價邊界值，避免為每個無效值都建立獨立 `[Fact]`
- **時間相依 base object（規則 A）**：當 base object 含「比對注入 `TimeProvider` 的日期欄位」（`timeProviderUsage` 非空 或 `specialHandling: "datetime"`）時，`CreateValid{Type}()` 改為 **instance 方法**，時間欄位由 `_timeProvider.GetUtcNow().UtcDateTime.AddYears(-2)` 推導取安全過去日期；禁 `DateTime.UtcNow`/`DateTime.Now`/寫死日期。非時間相依 validator 維持 static + 固定正值。
- **FluentValidation 套件（規則 B）**：validator 目標**保持 tests `.csproj` 不動** —— **禁止新增 `FluentValidation` PackageReference，也禁止為取得 FluentValidation 而新增任何 `ProjectReference`**。測試專案既有的、指向 SUT 的 `ProjectReference` 已傳遞性提供 `FluentValidation` 與 `TestHelper`（v10+ 併入主套件）。

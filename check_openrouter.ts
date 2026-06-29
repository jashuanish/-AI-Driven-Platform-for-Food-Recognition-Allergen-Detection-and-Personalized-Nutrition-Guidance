async function main() {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  const data = await response.json();
  const models = data.data.filter((m: any) => m.id.toLowerCase().includes("llama-3.2") && m.id.toLowerCase().includes("vision"));
  console.log("Matching OpenRouter models:");
  models.forEach((m: any) => console.log(m.id));
}
main();

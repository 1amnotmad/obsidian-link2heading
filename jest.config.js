module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>"],
	testMatch: ["**/*.test.ts"],
	moduleFileExtensions: ["ts", "js"],
	collectCoverageFrom: ["*.ts", "!*.test.ts"],
};

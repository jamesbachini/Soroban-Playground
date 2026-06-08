// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://soropg.com',
	base: '/docs',
	integrations: [
		starlight({
			title: 'SoroPG Docs',
			description: 'Developer documentation for SoroPG, the Soroban Playground.',
			customCss: ['/src/styles/soropg.css'],
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/jamesbachini/Soroban-Playground' }],
			sidebar: [
				{
					label: 'Start Here',
					items: [
						{ label: 'Overview', slug: '' },
						{ label: 'Getting Started', slug: 'getting-started' },
					],
				},
				{
					label: 'Using SoroPG',
					items: [
						{ label: 'Workspaces', slug: 'workspaces' },
						{ label: 'Build, Test, and Audit', slug: 'build-test-audit' },
						{ label: 'Deploy Contracts', slug: 'deploy' },
						{ label: 'Explore Contracts', slug: 'explore' },
						{ label: 'AI Assistants', slug: 'ai' },
						{
							label: 'Academy',
							items: [
								{ label: 'Academy Overview', slug: 'academy' },
								{ label: 'Hello World', slug: 'academy/hello-world-build-test-deploy' },
								{ label: 'AI-Assisted Development', slug: 'academy/ai-assisted-contract-development' },
								{ label: 'Agentic AI via MCP', slug: 'academy/agentic-ai-mcp' },
							],
						},
						{ label: 'Wallets and Networks', slug: 'wallets-and-networks' },
						{ label: 'Share and Import Projects', slug: 'share-and-import' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'HTTP API', slug: 'reference/http-api' },
						{
							label: 'llms.txt',
							link: '/llms.txt',
							attrs: { target: '_blank', rel: 'noopener noreferrer' },
						},
						{ label: 'Troubleshooting', slug: 'troubleshooting' },
					],
				},
			],
		}),
	],
});
